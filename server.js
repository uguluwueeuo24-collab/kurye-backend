const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// --- SİSTEM AYARLARI VE BELLEK VERİLERİ ---
let appSettings = {
  isLocked: false,            // Sipariş kilitli mi?
  extraFee: 50,               // Kurye ek ücreti (TL)
  bagFeePerItem: 0.25,        // Poşet başı ücret (TL)
  phoneNumber: "905xxxxxxxx", // Siparişlerin düşeceği numaran
  passwords: {
    pass1: "1234",            // 1. Gizli Şifre
    pass2: "5678"             // 2. Gizli Şifre
  }
};

let users = []; // E-posta ve OTP verileri

// 1. UYGULAMA AÇILINCA AYARLARI ÇEK
app.get('/api/settings', (req, res) => {
  res.json({
    isLocked: appSettings.isLocked,
    extraFee: appSettings.extraFee,
    bagFeePerItem: appSettings.bagFeePerItem,
    phoneNumber: appSettings.phoneNumber
  });
});

// 2. E-POSTA İLE KAYIT VE OTP ÜRETME
app.post('/api/auth/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ success: false, message: 'E-posta ve şifre zorunludur.' });
  }

  const otp = Math.floor(100000 + Math.random() * 900000).toString();
  
  const existingUserIndex = users.findIndex(u => u.email === email);
  if (existingUserIndex !== -1) {
    users[existingUserIndex] = { email, password, otp, isVerified: false };
  } else {
    users.push({ email, password, otp, isVerified: false });
  }

  console.log(`[OTP] ${email} için üretilen doğrulama kodu: ${otp}`);

  res.json({ 
    success: true, 
    message: 'Doğrulama kodu oluşturuldu.',
    debugOtp: otp
  });
});

// 3. OTP DOĞRULAMA
app.post('/api/auth/verify-otp', (req, res) => {
  const { email, otp } = req.body;
  const user = users.find(u => u.email === email);

  if (!user) {
    return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
  }

  if (user.otp === otp) {
    user.isVerified = true;
    return res.json({ success: true, message: 'Hesap doğrulandı!' });
  }

  res.status(400).json({ success: false, message: 'Hatalı OTP kodu!' });
});

// 4. GİZLİ PANEL GİRİŞİ (30 TIKLAMA)
app.post('/api/admin/verify', (req, res) => {
  const { pass1, pass2 } = req.body;
  if (pass1 === appSettings.passwords.pass1 && pass2 === appSettings.passwords.pass2) {
    return res.json({ success: true, settings: appSettings });
  }
  res.status(401).json({ success: false, message: "Gizli panel şifreleri hatalı!" });
});

// 5. GİZLİ PANEL AYARLARINI GÜNCELLEME
app.post('/api/admin/update-settings', (req, res) => {
  const { pass1, pass2, newPass1, newPass2, phoneNumber, isLocked, extraFee, bagFeePerItem } = req.body;

  if (pass1 !== appSettings.passwords.pass1 || pass2 !== appSettings.passwords.pass2) {
    return res.status(401).json({ success: false, message: "Yetkisiz erişim!" });
  }

  if (newPass1) appSettings.passwords.pass1 = newPass1;
  if (newPass2) appSettings.passwords.pass2 = newPass2;
  if (phoneNumber !== undefined) appSettings.phoneNumber = phoneNumber;
  if (typeof isLocked === "boolean") appSettings.isLocked = isLocked;
  if (extraFee !== undefined) appSettings.extraFee = Number(extraFee);
  if (bagFeePerItem !== undefined) appSettings.bagFeePerItem = Number(bagFeePerItem);

  res.json({ success: true, message: "Ayarlar güncellendi.", settings: appSettings });
});

// 6. SİPARİŞ OLUŞTURMA
app.post('/api/order', (req, res) => {
  if (appSettings.isLocked) {
    return res.status(403).json({ success: false, message: "Sipariş alımı şu an kilitlidir." });
  }

  const { customerName, customerPhone, address, items, bagCount, notes } = req.body;
  const totalBagFee = (bagCount || 0) * appSettings.bagFeePerItem;

  const messageText = `📦 *BEŞEVLER JET KURYE SİPARİŞİ*\n\n` +
    `👤 *Müşteri:* ${customerName}\n` +
    `📞 *Tel:* ${customerPhone}\n` +
    `📍 *Adres:* ${address}\n` +
    `🛒 *Alınacaklar:* ${items}\n` +
    `🛍️ *Poşet:* ${bagCount || 0} Adet (${totalBagFee} TL)\n` +
    `💵 *Kurye Ek Ücreti:* ${appSettings.extraFee} TL\n` +
    `📝 *Not:* ${notes || 'Yok'}`;

  const whatsappUrl = `https://wa.me/${appSettings.phoneNumber}?text=${encodeURIComponent(messageText)}`;

  res.json({ success: true, message: "Sipariş oluşturuldu.", whatsappUrl });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda başarıyla başlatıldı.`));
    
