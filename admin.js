window.onload = () => { 
    if(document.getElementById('inventoryTableBody')) {
        loadInventory(); 
        fetchOrders();
        loadWebSettings(); 
        
        // Auto Sync Every 1 Hour (3600000 ms)
        setInterval(() => {
            console.log("Running Hourly Auto-Sync...");
            syncWithWMS(true);
        }, 3600000);
    }
};

function openAdminTab(tabId, btnElement) {
    document.querySelectorAll('.tab-content').forEach(c => c.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.getElementById(tabId).style.display = 'block';
    btnElement.classList.add('active');
}

// ==========================================
// 1. WMS SYNC & IN/OUT STOCK CALCULATION
// ==========================================
window.syncWithWMS = async function(isAuto = false) {
    if(!isAuto && !confirm("Sync all data from WMS?")) return;
    if(!isAuto) document.getElementById('inventoryTableBody').innerHTML = '<tr><td colspan="8" style="text-align:center;">Syncing data... Please wait...</td></tr>';

    try {
        const { data: wmsItems, error: wmsErr } = await db.from('wms_items').select('*');
        if (wmsErr) throw wmsErr;

        const { data: wmsTx, error: txErr } = await db.from('wms_transactions').select('item, type, qty');
        if (txErr) console.warn("WMS Transactions fetch error:", txErr);

        const { data: ecomItems } = await db.from('ecom_products').select('id, code, price, images, desc_text');

        let balances = {};
        if (wmsTx) {
            wmsTx.forEach(tx => {
                let c = tx.item || tx.code; 
                if(!c) return;
                if(!balances[c]) balances[c] = 0;
                
                let q = parseFloat(tx.qty || 0);
                let t = String(tx.type || '').toUpperCase().trim();
                
                if (t === 'OUT' || t === 'ISSUE' || t === 'MINUS') {
                    balances[c] -= Math.abs(q);
                } else if (t === 'IN' || t === 'RECEIVE' || t === 'PLUS') {
                    balances[c] += Math.abs(q);
                }
            });
        }

        let upsertData = [];
        wmsItems.forEach(wms => {
            let wmsCode = wms.code || wms.item;
            if (!wmsCode) return;
            let exist = ecomItems ? ecomItems.find(e => e.code === wmsCode) : null;
            
            upsertData.push({
                id: exist ? exist.id : undefined,
                code: wmsCode,
                name: wms.name,
                cat: wms.cat,
                subcat: wms.subcat,
                size: wms.size,
                other: wms.other,
                photoUrl: wms.photoUrl,
                status: wms.status,
                stock_quantity: balances[wmsCode] || 0,
                price: exist ? exist.price : 0, 
                images: (exist && exist.images && exist.images.length > 0) ? exist.images : (wms.photoUrl ? [wms.photoUrl] : []),
                desc_text: exist ? exist.desc_text : wms.desc_text 
            });
        });

        upsertData.forEach(item => { if(!item.id) delete item.id; });

        const { error: syncErr } = await db.from('ecom_products').upsert(upsertData, { onConflict: 'code' });
        if (syncErr) throw syncErr;

        if(!isAuto) { alert("Sync Completed Successfully!"); loadInventory(); }
    } catch (error) {
        console.error("Sync Error: ", error);
        if(!isAuto) { alert("Sync Error: " + error.message); loadInventory(); }
    }
}

// ==========================================
// 2. INVENTORY & DELETE
// ==========================================
let currentProducts = [];

async function loadInventory() {
    const { data: products } = await db.from('ecom_products').select('*').order('code', { ascending: true });
    if (!products) return;
    currentProducts = products;
    
    document.getElementById('inventoryTableBody').innerHTML = products.map(p => {
        let img = (p.images && p.images.length > 0) ? p.images[0] : (p.photoUrl || 'https://via.placeholder.com/50');
        let subcatHtml = p.subcat ? `<br><small style="color:#ff6600;">${p.subcat}</small>` : '';
        
        return `
        <tr>
            <td><b>${p.code || 'N/A'}</b></td>
            <td><img src="${img}" style="width:40px;height:40px;object-fit:cover;border-radius:4px;"></td>
            <td>${p.name || ''}</td>
            <td>${p.cat || 'N/A'} ${subcatHtml}</td>
            <td style="color:#ff6600; font-weight:bold;">$${p.price || 0}</td>
            <td style="font-weight:bold; color:${p.stock_quantity > 0 ? 'green':'red'}">${p.stock_quantity || 0}</td>
            <td>
                <button onclick="openEdit(${p.id})" style="background:#f39c12; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;">Edit Price/Photo</button>
                <button onclick="deleteProduct(${p.id})" style="background:#e74c3c; color:white; border:none; padding:5px 8px; border-radius:4px; cursor:pointer;">Delete</button>
            </td>
        </tr>`;
    }).join('');
}

window.deleteProduct = async function(id) {
    if(!confirm("Are you sure you want to delete this product?")) return;
    const { error } = await db.from('ecom_products').delete().eq('id', id);
    if(error) alert("Error deleting: " + error.message);
    else { alert("Product Deleted!"); loadInventory(); }
}

window.openEdit = function(id) {
    let p = currentProducts.find(x => x.id === id);
    if(!p) return;
    document.getElementById('editProductId').value = p.id;
    document.getElementById('editItemCode').value = p.code;
    document.getElementById('editPrice').value = p.price || 0;
    document.getElementById('editDescription').value = p.desc_text || ''; 
    document.getElementById('editProductModal').style.display = 'flex';
}

window.closeEditModal = function() { document.getElementById('editProductModal').style.display = 'none'; }

window.saveProductDetails = async function() {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "Saving & Uploading...";
    btn.disabled = true;

    try {
        let id = document.getElementById('editProductId').value;
        let price = parseFloat(document.getElementById('editPrice').value) || 0;
        let descText = document.getElementById('editDescription').value;
        
        let updateData = { price: price, desc_text: descText };

        const fileInput = document.getElementById('editImages');
        
        if (fileInput && fileInput.files && fileInput.files.length > 0) {
            const files = Array.from(fileInput.files);
            let uploadedUrls = [];

            for (const file of files) {
                let safeName = file.name ? file.name.replace(/\s/g, '_') : 'image.png';
                const fileName = `products/${Date.now()}_${safeName}`;

                const { data, error: uploadErr } = await db.storage
                    .from('product_images')
                    .upload(fileName, file);

                if (uploadErr) throw uploadErr;

                const { data: urlData } = db.storage
                    .from('product_images')
                    .getPublicUrl(data.path);

                uploadedUrls.push(urlData.publicUrl);
            }

            let existingProduct = currentProducts.find(x => x.id == id);
            let finalImages = [];
            if (existingProduct && existingProduct.photoUrl) {
                finalImages.push(existingProduct.photoUrl);
            }
            finalImages = [...finalImages, ...uploadedUrls];

            updateData.images = finalImages; 
        }
        
        const { error } = await db.from('ecom_products').update(updateData).eq('id', id);
        if (error) throw error;
        
        alert("Product updated successfully!");
        closeEditModal(); 
        loadInventory();
        
        if(fileInput) fileInput.value = ""; 

    } catch (e) {
        console.error("Save Error:", e);
        alert("Error saving: " + e.message);
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}

// ==========================================
// 3. ORDERS MANAGEMENT
// ==========================================
let currentOrders = [];

async function fetchOrders() {
    const tbody = document.getElementById('orderTableBody');
    tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Loading orders...</td></tr>';
    try {
        const { data: orders, error } = await db.from('ecom_orders').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        currentOrders = orders || [];
        
        if (currentOrders.length === 0) return tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;">No recent orders.</td></tr>';

        tbody.innerHTML = currentOrders.map(o => `
            <tr>
                <td>${new Date(o.created_at).toLocaleDateString()}</td>
                <td>#${o.order_id}</td> 
                <td>${o.customer_name || 'N/A'}<br>${o.customer_phone || ''}</td>
                <td style="color:var(--primary-color); font-weight:bold;">$${o.total_amount || 0}</td>
                <td><span style="background:#eee; padding:4px 8px; border-radius:4px; font-weight:bold;">${o.status || 'Pending'}</span></td>
                <td><button onclick="viewOrder(${o.order_id})" style="background:#333; color:white; border:none; padding:5px 10px; border-radius:4px; cursor:pointer;">View</button></td>
            </tr>
        `).join('');
    } catch (e) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align:center; color:red;">Error loading orders.</td></tr>`;
    }
}

window.viewOrder = function(id) {
    let o = currentOrders.find(x => x.order_id == id);
    if (!o) return;

    document.getElementById('currentOrderId').value = o.order_id;
    document.getElementById('orderInfo').innerHTML = `
        <b>Customer:</b> ${o.customer_name || 'N/A'} <br>
        <b>Phone:</b> ${o.customer_phone || 'N/A'} <br>
        <b>Address:</b> ${o.address || 'N/A'} <br>
        <b>Date:</b> ${new Date(o.created_at).toLocaleString()}
    `;

    let items = [];
    try {
        items = typeof o.order_details === 'string' ? JSON.parse(o.order_details) : (o.order_details || []);
    } catch (e) {
        console.warn("Could not parse order details:", e);
    }

    const tbody = document.getElementById('orderItemsBody');
    if (items && items.length > 0) {
        tbody.innerHTML = items.map(i => {
            let itemName = i.name || 'Unknown Item';
            let safeName = itemName.replace(/'/g, "&apos;").replace(/"/g, "&quot;");
            return `<tr>
                <td>${safeName}</td>
                <td>$${i.price || 0}</td>
                <td>${i.qty || 0}</td>
                <td>$${((i.price || 0) * (i.qty || 0)).toFixed(2)}</td>
            </tr>`;
        }).join('');
    } else {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:#888;">No items found in this order.</td></tr>';
    }

    document.getElementById('orderTotalDisplay').innerText = o.total_amount || 0;
    document.getElementById('orderStatusSelect').value = o.status || 'Pending';
    document.getElementById('orderDetailModal').style.display = 'flex';
}

window.saveOrderStatus = async function() {
    let id = document.getElementById('currentOrderId').value;
    let status = document.getElementById('orderStatusSelect').value;
    
    const { error } = await db.from('ecom_orders').update({ status: status }).eq('order_id', id);
    
    if(error) alert("Error updating status: " + error.message);
    else { 
        alert("Status updated!"); 
        document.getElementById('orderDetailModal').style.display = 'none'; 
        fetchOrders(); 
    }
}

// ==========================================
// 4. WEB SETTINGS & LOGO UPLOADS
// ==========================================
async function loadWebSettings() {
    try {
        const { data, error } = await db.from('ecom_settings').select('*');
        if (error) throw error;
        if (!data || data.length === 0) return;

        const getVal = (k) => { let item = data.find(s => s.key === k); return item ? item.value : null; };

        let bannerInfo = getVal('banner_info');
        if (bannerInfo) document.getElementById('setBannerText').value = typeof bannerInfo === 'object' ? bannerInfo.text : bannerInfo;

        let heroBanners = getVal('hero_banners');
        if (heroBanners && heroBanners.length > 0) {
            const previewEl = document.getElementById('adminBannersPreview') || document.getElementById('adminHeroGrid');
            if(previewEl) {
                previewEl.innerHTML = heroBanners.map((url, i) => `
                    <div style="position:relative; width:120px; height:80px; flex-shrink:0;">
                        <img src="${url}" style="width:100%; height:100%; object-fit:cover; border-radius:4px; border:1px solid #ccc;">
                        <button onclick="deleteHeroImage(${i})" style="position:absolute; top:-5px; right:-5px; background:red; color:white; border:none; border-radius:50%; width:20px; height:20px; cursor:pointer;">X</button>
                    </div>
                `).join('');
            }
        }

        let headerLogoInfo = getVal('header_logo');
        if(headerLogoInfo && document.getElementById('headerLogoPreview')) {
            document.getElementById('headerLogoPreview').src = typeof headerLogoInfo === 'object' ? headerLogoInfo.url : headerLogoInfo;
        }

        let footerLogoInfo = getVal('footer_logo');
        if (footerLogoInfo && document.getElementById('footerLogoPreview')) {
            document.getElementById('footerLogoPreview').src = typeof footerLogoInfo === 'object' ? footerLogoInfo.url : footerLogoInfo;
        }

        let fInfo = getVal('footer_info');
        if (fInfo) {
            if(document.getElementById('setFooterTitle')) document.getElementById('setFooterTitle').value = fInfo.title || '';
            if(document.getElementById('setFooterDesc')) document.getElementById('setFooterDesc').value = fInfo.desc || '';
            if(document.getElementById('setFooterAddress')) document.getElementById('setFooterAddress').value = fInfo.address || '';
            if(document.getElementById('setFooterPhone')) document.getElementById('setFooterPhone').value = fInfo.phone || '';
            if(document.getElementById('setFooterEmail')) document.getElementById('setFooterEmail').value = fInfo.email || '';
            if(document.getElementById('setLinkFb')) document.getElementById('setLinkFb').value = fInfo.fb_link || '';
            if(document.getElementById('setLinkYt')) document.getElementById('setLinkYt').value = fInfo.yt_link || '';
            if(document.getElementById('setLinkWeb')) document.getElementById('setLinkWeb').value = fInfo.web_link || '';
        }
    } catch (error) {
        console.error("Error loading web settings:", error);
    }
}

window.uploadFooterLogo = async function() {
    const fileInput = document.getElementById('footerLogoUpload');
    if(!fileInput || !fileInput.files || fileInput.files.length === 0) return alert("Please select a logo image first.");
    
    const file = fileInput.files[0];
    const fileName = `footer_logo_${Date.now()}_${file.name.replace(/\s/g, '_')}`;

    try {
        const { data, error } = await db.storage.from('product_images').upload(fileName, file);
        if(error) throw error;
        
        const pubUrl = db.storage.from('product_images').getPublicUrl(data.path).data.publicUrl;
        document.getElementById('footerLogoPreview').src = pubUrl;
        
        await db.from('ecom_settings').upsert({ key: 'footer_logo', value: pubUrl });
        alert("Footer Logo Uploaded Successfully!");
        fileInput.value = ""; 
    } catch (e) { 
        alert("Upload Error: " + e.message); 
    }
}

window.uploadHeroImage = async function() {
    const fileInput = document.getElementById('heroImageUpload');
    if(!fileInput || !fileInput.files.length) return alert("Please select an image first.");
    
    const { data: existing } = await db.from('ecom_settings').select('value').eq('key', 'hero_banners').single();
    let banners = existing?.value || [];
    if(banners.length >= 5) return alert("Maximum 5 banners allowed. Delete one first.");

    const file = fileInput.files[0];
    const fileName = `hero_${Date.now()}_${file.name.replace(/\s/g, '_')}`;

    try {
        const { data, error } = await db.storage.from('product_images').upload(fileName, file);
        if(error) throw error;
        
        const pubUrl = db.storage.from('product_images').getPublicUrl(data.path).data.publicUrl;
        banners.push(pubUrl);
        
        await db.from('ecom_settings').upsert({ key: 'hero_banners', value: banners });
        alert("Banner Uploaded!");
        fileInput.value = ""; 
        loadWebSettings(); // Reload to show new preview
    } catch (e) {
        alert("Upload Error: " + e.message);
    }
}

window.deleteHeroImage = async function(index) {
    if(!confirm("Delete this banner?")) return;
    const { data: existing } = await db.from('ecom_settings').select('value').eq('key', 'hero_banners').single();
    let banners = existing?.value || [];
    banners.splice(index, 1);
    await db.from('ecom_settings').upsert({ key: 'hero_banners', value: banners });
    loadWebSettings(); // Reload to show updated preview
}

window.saveSettings = async function() {
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "Saving...";
    btn.disabled = true;

    try {
        // 1. Banner Text
        const bannerText = document.getElementById('setBannerText') ? document.getElementById('setBannerText').value : '';
        const { error: err1 } = await db.from('ecom_settings')
            .upsert({ key: 'banner_info', value: { text: bannerText } }, { onConflict: 'key' })
            .select();
        if (err1) throw err1;

        // 2. Footer Info & Links
        const footerInfoData = { 
            title: document.getElementById('setFooterTitle') ? document.getElementById('setFooterTitle').value : '', 
            desc: document.getElementById('setFooterDesc') ? document.getElementById('setFooterDesc').value : '', 
            address: document.getElementById('setFooterAddress') ? document.getElementById('setFooterAddress').value : '', 
            phone: document.getElementById('setFooterPhone') ? document.getElementById('setFooterPhone').value : '', 
            email: document.getElementById('setFooterEmail') ? document.getElementById('setFooterEmail').value : '',
            fb_link: document.getElementById('setLinkFb') ? document.getElementById('setLinkFb').value.trim() : '',
            yt_link: document.getElementById('setLinkYt') ? document.getElementById('setLinkYt').value.trim() : '',
            web_link: document.getElementById('setLinkWeb') ? document.getElementById('setLinkWeb').value.trim() : ''
        };
        const { error: err2 } = await db.from('ecom_settings')
            .upsert({ key: 'footer_info', value: footerInfoData }, { onConflict: 'key' })
            .select();
        if (err2) throw err2;

        alert("All Settings Saved Successfully!");
        
    } catch(e) { 
        console.error("Settings Save Error:", e);
        alert("Error saving settings: " + (e.message || JSON.stringify(e))); 
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}