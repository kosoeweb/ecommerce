// ==========================================
// 1. SUPABASE INITIALIZATION
// ==========================================
// ⚠️ သတိပြုရန်: အောက်ပါ supabaseKey နေရာမှာ သင့်ရဲ့ အမှန်တကယ် Key ကို ပြန်ထည့်ပါ ⚠️
const supabaseUrl = 'https://zdifzvpjmmmsfitjsraw.supabase.co';
const supabaseKey = 'sb_publishable_Eghy_AeArZhWU86ETOoWqg_FI8xXh9P'; 
const db = window.supabase.createClient(supabaseUrl, supabaseKey);

// ဤစာကြောင်း ပြုတ်ကျန်ခဲ့သဖြင့် ပြန်ထည့်ပေးထားပါသည်
let allProducts = []; 

document.addEventListener("DOMContentLoaded", () => {
    Promise.all([
        fetchProducts(),
        checkUserStatus(),
        loadWebSettingsAndBanners(),
        loadCategories() 
    ]).then(() => {
        const loader = document.getElementById('globalLoader');
        if (loader) {
            loader.style.opacity = '0';
            setTimeout(() => loader.style.display = 'none', 300); 
        }
    }).catch(error => {
        console.error("Initial load error:", error);
        const loader = document.getElementById('globalLoader');
        if (loader) loader.innerHTML = '<h3 style="color:red;">Error loading data. Please refresh.</h3>';
    });
});

// ==========================================
// 2. CATEGORY & SUB-CATEGORY LOADING
// ==========================================
async function loadCategories() {
    try {
        const { data, error } = await db.from('ecom_products').select('cat, subcat');
        if (error) throw error;

        let grouped = {};
        data.forEach(item => {
            let c = item.cat ? item.cat.trim() : '';
            let s = item.subcat ? item.subcat.trim() : '';
            if (c) {
                if (!grouped[c]) grouped[c] = new Set();
                if (s) grouped[c].add(s);
            }
        });

        let menuHtml = `<a class="dropdown-item" onclick="searchProducts('')" style="color:var(--primary-color); font-weight:bold; border-bottom:1px solid #ddd;">🔍 View All Products</a>`;

        for (let c in grouped) {
            menuHtml += `<div class="dropdown-item" style="font-weight:bold; background:#f4f7f6;" onclick="searchProducts('${c}')">📁 ${c}</div>`;
            grouped[c].forEach(s => {
                menuHtml += `<a class="dropdown-item" style="padding-left: 30px; font-size:14px;" onclick="searchProducts('${s}')">↳ ${s}</a>`;
            });
        }

        const catMenu = document.getElementById('categoryMenu');
        if (catMenu) {
            if (Object.keys(grouped).length === 0) {
                catMenu.innerHTML = '<div style="padding: 15px;">No categories found</div>';
            } else {
                catMenu.innerHTML = menuHtml;
            }
        }
    } catch (error) {
        console.error("Error loading categories:", error);
    }
}

// ==========================================
// 3. AUTHENTICATION
// ==========================================
let isLoginMode = true;
window.toggleAuthMode = function() {
    isLoginMode = !isLoginMode;
    document.getElementById('authTitle').innerText = isLoginMode ? 'Login' : 'Sign Up';
    document.getElementById('signupFields').style.display = isLoginMode ? 'none' : 'block';
    document.getElementById('authSubmitBtn').innerText = isLoginMode ? 'Login' : 'Sign Up';
}

window.handleAuth = async function() {
    const email = document.getElementById('authEmail').value;
    const password = document.getElementById('authPassword').value;
    const btn = document.getElementById('authSubmitBtn');
    
    if(!email || !password) return alert("Please enter email and password");
    btn.innerText = "Loading...";

    try {
        if(isLoginMode) {
            const { error } = await db.auth.signInWithPassword({ email, password });
            if(error) throw error;
            alert("Login Successful!");
            closeAuthModal();
            checkUserStatus();
        } else {
            const name = document.getElementById('authName').value;
            const { error } = await db.auth.signUp({ email, password, options: { data: { full_name: name } } });
            if(error) throw error;
            alert("Sign Up Successful!");
            closeAuthModal();
        }
    } catch (e) {
        alert("Auth Error: " + e.message);
    }
    btn.innerText = isLoginMode ? 'Login' : 'Sign Up';
}

async function checkUserStatus() {
    const { data: { session } } = await db.auth.getSession();
    const authBtn = document.getElementById('authBtn');
    const emailDisplay = document.getElementById('userEmailDisplay');
    
    if(session) {
        if(emailDisplay) emailDisplay.innerText = session.user.email;
        if(authBtn) {
            authBtn.innerText = "Logout";
            authBtn.onclick = async () => { await db.auth.signOut(); window.location.reload(); };
        }
    } else {
        if(emailDisplay) emailDisplay.innerText = "";
        if(authBtn) {
            authBtn.innerText = "Login";
            authBtn.onclick = openAuthModal;
        }
    }
}

// ==========================================
// 4. SETTINGS & BANNERS
// ==========================================
async function loadWebSettingsAndBanners() {
    try {
        const { data, error } = await db.from('ecom_settings').select('*');
        if (error) throw error;
        if (!data || data.length === 0) return;

        const getVal = (k) => { let item = data.find(s => s.key === k); return item ? item.value : null; };

        // Banner Text
        let bannerInfo = getVal('banner_info');
        const marqueeEl = document.getElementById('marqueeText');
        if (bannerInfo && marqueeEl) marqueeEl.innerText = typeof bannerInfo === 'object' ? bannerInfo.text : bannerInfo;

        // Hero Banners
        let heroBanners = getVal('hero_banners');
        const sliderWrapper = document.getElementById('frontSliderWrapper');
        const dotsContainer = document.getElementById('frontHeroDots');

        if (heroBanners && heroBanners.length > 0 && sliderWrapper) {
            sliderWrapper.innerHTML = heroBanners.map((url, index) => `
                <div style="min-width: 100%; height: 100%;">
                    <img src="${url}" style="width: 100%; height: 100%; object-fit: cover;" ${index === 0 ? '' : 'loading="lazy"'}>
                </div>
            `).join('');
            
            if (dotsContainer) {
                dotsContainer.innerHTML = heroBanners.map((_, i) => `<span class="dot ${i === 0 ? 'active' : ''}" onclick="goToSlide(${i})"></span>`).join('');
            }
            startHeroSlider(heroBanners.length);
        } else if (sliderWrapper) {
            sliderWrapper.innerHTML = '<div style="width:100%; display:flex; align-items:center; justify-content:center;">No banners found.</div>';
        }

        // Header Logo
        let headerLogo = getVal('header_logo');
        const headerLogoEl = document.getElementById('mainHeaderLogo');
        if (headerLogo && headerLogoEl) {
            headerLogoEl.src = typeof headerLogo === 'object' ? headerLogo.url : headerLogo;
            headerLogoEl.style.display = 'block';
        }

        // Footer Logo
        let footerLogo = getVal('footer_logo');
        const footerLogoEl = document.getElementById('footerLogoDisplay');
        if (footerLogo && footerLogoEl) {
            footerLogoEl.src = typeof footerLogo === 'object' ? footerLogo.url : footerLogo;
            footerLogoEl.style.display = 'block';
        }

        // Footer Information
        let fInfo = getVal('footer_info');
        if (fInfo) {
            const setHtml = (id, text) => {
                const el = document.getElementById(id);
                if (el) el.innerHTML = text; 
            };

            setHtml('footerTitleDisplay', fInfo.title || 'Universal Tractor');
            setHtml('footerDescDisplay', fInfo.desc || 'Your trusted partner.');
            setHtml('footerAddressDisplay', fInfo.address || 'Address');
            setHtml('footerPhoneDisplay', fInfo.phone || 'Phone');
            setHtml('footerEmailDisplay', fInfo.email || 'Email');

            const fbLinkEl = document.getElementById('linkFbDisplay');
            if (fbLinkEl && fInfo.fb_link) { fbLinkEl.href = fInfo.fb_link; fbLinkEl.style.display = 'flex'; } 
            else if (fbLinkEl) fbLinkEl.style.display = 'none';

            const ytLinkEl = document.getElementById('linkYtDisplay');
            if (ytLinkEl && fInfo.yt_link) { ytLinkEl.href = fInfo.yt_link; ytLinkEl.style.display = 'flex'; } 
            else if (ytLinkEl) ytLinkEl.style.display = 'none';
            
            const webLinkEl = document.getElementById('linkWebDisplay');
            if (webLinkEl && fInfo.web_link) { webLinkEl.href = fInfo.web_link; webLinkEl.style.display = 'flex'; } 
            else if (webLinkEl) webLinkEl.style.display = 'none';
        }
    } catch (e) {
        console.error("Settings Load Error:", e);
    }
}

// Hero Slider Controls
let slideIndex = 0;
let slideTimer;
window.goToSlide = function(index) { slideIndex = index; updateSlider(); resetSliderTimer(); }
function updateSlider() {
    const sliderWrapper = document.getElementById('frontSliderWrapper');
    if(sliderWrapper) sliderWrapper.style.transform = `translateX(-${slideIndex * 100}%)`;
    document.querySelectorAll('.dot').forEach((d, i) => d.classList.toggle('active', i === slideIndex));
}
function resetSliderTimer() {
    clearInterval(slideTimer);
    let totalSlides = document.querySelectorAll('.dot').length;
    if(totalSlides > 1) slideTimer = setInterval(() => { slideIndex = (slideIndex + 1) % totalSlides; updateSlider(); }, 4000);
}
function startHeroSlider(totalSlides) { if(totalSlides <= 1) return; resetSliderTimer(); }


// ==========================================
// 5. PRODUCTS & SEARCH LOGIC
// ==========================================
async function fetchProducts() {
    const { data: products, error } = await db.from('ecom_products')
        .select('*')
        .order('code', { ascending: true })
        .limit(100); 
        
    if (error) {
        const grid = document.getElementById('productGrid');
        if(grid) grid.innerHTML = '<p style="color:red;text-align:center;">Database Error.</p>';
        return;
    }
    allProducts = products || [];
    renderProducts(allProducts);
}

function renderProducts(products) {
    const grid = document.getElementById('productGrid');
    if(!grid) return;
    if(products.length === 0) {
        grid.innerHTML = '<p style="text-align:center; width:100%;">No products found.</p>';
        return;
    }
    
    grid.innerHTML = products.map(p => {
        let img = (p.images && p.images.length > 0) ? p.images[0] : (p.photoUrl || 'https://via.placeholder.com/200');
        let safeName = (p.name || '').replace(/'/g, "\\'");
        return `
        <div class="product-card" onclick="openProductDetail(${p.id})">
            <img src="${img}" class="product-image" loading="lazy" alt="Product">
            <div class="product-info">
                <h3>${p.name || 'Unnamed'}</h3>
                <div class="price">$${p.price || 0}</div>
                <button class="add-to-cart-btn" onclick="event.stopPropagation(); addToCart(${p.id}, '${safeName}', ${p.price}, '${img}')">Add to Cart</button>
            </div>
        </div>`;
    }).join('');
}

window.searchProducts = async function(keyword) {
    // Menu ဖျောက်သည့်အပိုင်း
    const catMenu = document.getElementById('categoryMenu');
    if(catMenu) {
        catMenu.style.display = 'none'; 
        setTimeout(() => catMenu.style.display = '', 200); 
    }

    const grid = document.getElementById('productGrid');
    const btn = document.getElementById('loadMoreBtn');
    
    if(!keyword) {
        // currentOffset အပိုစာကြောင်းကို ဖယ်ရှားထားပါသည်
        fetchProducts(); 
        return;
    }
    
    if(btn) btn.style.display = 'none';
    grid.innerHTML = '<p style="text-align:center; width:100%;">Searching...</p>';
    
    const { data: filtered, error } = await db.from('ecom_products')
        .select('*')
        .or(`name.ilike.%${keyword}%,code.ilike.%${keyword}%,cat.ilike.%${keyword}%,subcat.ilike.%${keyword}%`)
        .limit(30);
        
    if(error) { grid.innerHTML = '<p style="color:red;text-align:center;">Search Error.</p>'; return; }
    
    allProducts = filtered || []; 
    renderProducts(filtered);
}

// ==========================================
// 6. MODALS
// ==========================================
window.openProductDetail = function(id) {
    let p = allProducts.find(x => x.id == id);
    if(!p) return;
    document.getElementById('detailName').innerText = p.name || 'Unknown';
    document.getElementById('detailCode').innerText = p.code || 'N/A';
    document.getElementById('detailPrice').innerText = '$' + (p.price || 0);
    document.getElementById('detailStock').innerText = p.stock_quantity || 0;
    
    let imgs = (p.images && p.images.length > 0) ? p.images : (p.photoUrl ? [p.photoUrl] : ['https://via.placeholder.com/400']);
    document.getElementById('detailMainImg').src = imgs[0];
    document.getElementById('detailThumbs').innerHTML = imgs.map(u => `<img src="${u}" onclick="document.getElementById('detailMainImg').src='${u}'" style="width:60px;height:60px;object-fit:cover;cursor:pointer;border:1px solid #ddd;border-radius:4px;">`).join('');

    let wmsGrid = document.getElementById('detailWmsInfo');
    let extraDetails = { "Category": p.cat, "Sub-Category": p.subcat, "Size": p.size, "Additional": p.other };
    let gridHTML = Object.entries(extraDetails).filter(([k, v]) => v && v !== 'null' && v !== '').map(([k, v]) => `<div><span style="color:#666; font-size: 12px;">${k.toUpperCase()}:</span><br><b>${v}</b></div>`).join('');
    let descHTML = p.desc_text ? `<div style="grid-column: span 2; border-top: 1px solid #ddd; padding-top: 10px; margin-top: 10px;">${p.desc_text}</div>` : '';
    wmsGrid.innerHTML = gridHTML + descHTML; wmsGrid.style.display = 'grid';
    
    let safeName = (p.name || '').replace(/'/g, "\\'");
    document.getElementById('detailAddToCartBtn').onclick = () => { addToCart(p.id, safeName, p.price, imgs[0]); closeProductDetail(); };
    document.getElementById('productDetailModal').style.display = 'flex';
}

window.closeProductDetail = function(e) { if(!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-btn')) document.getElementById('productDetailModal').style.display = 'none'; }
window.openAuthModal = function() { document.getElementById('authModal').style.display = 'flex'; }
window.closeAuthModal = function(e) { if(!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-btn')) document.getElementById('authModal').style.display = 'none'; }
window.openCheckoutModal = function() { document.getElementById('checkoutModal').style.display = 'flex'; toggleCart(); }
window.closeCheckoutModal = function(e) { if(!e || e.target.classList.contains('modal-overlay') || e.target.classList.contains('close-btn')) document.getElementById('checkoutModal').style.display = 'none'; }

// ==========================================
// 7. CART & CHECKOUT
// ==========================================
let cart = [];
window.toggleCart = function() { document.getElementById('cartSidebar').classList.toggle('show'); document.getElementById('cartOverlay').classList.toggle('show'); }
window.addToCart = function(id, name, price, img) { let i = cart.find(x => x.id === id); if(i) i.qty++; else cart.push({id, name, price, img, qty: 1}); updateCart(); }
window.removeFromCart = function(id) { cart = cart.filter(i => i.id !== id); updateCart(); }

function updateCart() {
    document.getElementById('cartCount').innerText = cart.reduce((s, i) => s + i.qty, 0);
    let total = 0;
    const cartItems = document.getElementById('cartItems');
    if(cartItems) {
        cartItems.innerHTML = cart.map(i => {
            total += i.price * i.qty;
            return `<div style="display:flex; align-items:center; gap:10px; margin-bottom:15px;"><img src="${i.img}" style="width:50px;height:50px;object-fit:cover;border-radius:4px;"><div style="flex-grow:1;"><h4 style="margin:0; font-size:14px;">${i.name}</h4><p style="margin:0; color:#ff6600;">$${i.price} x ${i.qty}</p></div><button onclick="removeFromCart(${i.id})" style="border:none;background:red;color:white;cursor:pointer;padding:5px 8px;border-radius:4px;">X</button></div>`;
        }).join('');
    }
    const cartTotal = document.getElementById('cartTotal');
    if(cartTotal) cartTotal.innerText = total.toFixed(2);
}

window.submitOrder = async function() {
    if (cart.length === 0) return alert("Your cart is empty!");
    
    const name = document.getElementById('chkName').value;
    const phone = document.getElementById('chkPhone').value;
    const address = document.getElementById('chkAddress').value;

    if (!name || !phone || !address) return alert("Please fill in all delivery details.");

    let total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    const btn = event.target;
    const originalText = btn.innerText;
    btn.innerText = "Placing Order...";
    btn.disabled = true;

    try {
        const { data, error } = await db.from('ecom_orders').insert([{
            customer_name: name,
            customer_phone: phone,
            address: address,
            total_amount: total,
            order_details: cart, 
            status: 'Pending'
        }]).select(); 

        if (error) throw error;
        if (!data || data.length === 0) throw new Error("Insert operation failed. Check RLS policies.");

        alert("Order Placed Successfully! (Order ID: #" + data[0].order_id + ")");
        
        cart = []; updateCart(); closeCheckoutModal();
        document.getElementById('chkName').value = ''; document.getElementById('chkPhone').value = ''; document.getElementById('chkAddress').value = '';

    } catch (error) {
        console.error("Order Error: ", error);
        alert("Failed to place order: " + (error.message || JSON.stringify(error)));
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
}