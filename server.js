const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const nodemailer = require('nodemailer');

const app = express();
app.use(cors());
app.use(express.json());

// --- VERİTABANI BAĞLANTISI (MongoDB Atlas) ---
// Render ortam değişkenlerinden (Environment Variables) alınır veya direkt bağlanır.
const MONGO_URI = process.env.MONGO_URI || "mongodb+srv://admin:kurye1234@cluster0.mongodb.net/kuryedb?retryWrites=true&w=majority";

mongoose.connect(MONGO_URI)
  .then(() => console.log('Veritabanına (MongoDB) başarıyla bağlandı.'))
  .catch(err => console.error('Veritabanı bağlantı hatası:', err));

// --- NODEMAILER (E-posta Gönderici Ayarı) ---
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER || 'ornek-eposta@gmail.com', // Gönderici E-postan
    pass: process.env.EMAIL_PASS || 'uygulama-sifresi'       // Gmail Uygulama Şifresi
  }
});

// --- VERİ MODELLERİ (SCHEMAS) ---

// Kullanıcı Modeli
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  isVerified: { type: Boolean, default: false },
  otpCode: { type: String },
  otpExpires: { type: Date }
});

// Uygulama Ayarları Modeli
const SettingsSchema = new mongoose.Schema({
  isLocked: { type: Boolean, default: false },
  extraFee: { type: Number, default: 50 },
  bagFeePerItem: { type: Number, default: 0.25 },
  phoneNumber: { type: String, default: "" },
  passwords: {
    pass1: { type: String, default: "1234" },
    pass2: { type: String, default: "5678" }
  }
});

const User = mongoose.model('User', UserSchema);
const Settings = mongoose.model('Settings', SettingsSchema);

// Varsayılan ayarları oluşturma kontrolü
async function initSettings() {
  const count = await Settings.countDocuments();
  if (count === 0) {
    await Settings.create({});
    console.log("Varsayılan ayarlar veritabanına eklendi.");
  }
}
initSettings();

// ==========================================
// 1. E-POSTA + ŞİFRE İLE HESAP OLUŞTURMA (KAYIT)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body;

    let user = await User.findOne({ email });
    if (user && user.isVerified) {
      return res.status(400).json({ success: false, message: 'Bu e-posta zaten kayıtlı.' });
    }

    // 6 Haneli OTP Kod Üretme
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 dakika geçerli
    const hashedPassword = await bcrypt.hash(password, 10);

    if (user && !user.isVerified) {
      user.password = hashedPassword;
      user.otpCode = otp;
      user.otpExpires = otpExpires;
      await user.save();
    } else {
      user = new User({ email, password: hashedPassword, otpCode: otp, otpExpires });
      await user.save();
    }

    // Doğrulama Kodunu E-Postaya Gönderme
    const mailOptions = {
      from: '"Kurye Uygulaması" <no-reply@kuryeapp.com>',
      to: email,
      subject: 'Tek Kullanımlık Doğrulama Kodunuz',
      text: `Hesabınızı doğrulamak için kodunuz: ${otp}\nBu kod 10 dakika boyunca geçerlidir.`
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: 'Doğrulama kodu e-postanıza gönderildi.' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Kayıt sırasında bir hata oluştu.', error: error.message });
  }
});

// ==========================================
// 2. TEK KULLANIMLIK KODU (OTP) DOĞRULAMA
// ==========================================
app.post('/api/auth/verify-otp', async (req, res) => {
  try {
    const { email, otp } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    if (user.otpCode !== otp || user.otpExpires < Date.now()) {
      return res.status(400).json({ success: false, message: 'Geçersiz veya süresi dolmuş kod!' });
    }

    user.isVerified = true;
    user.otpCode = undefined;
    user.otpExpires = undefined;
    await user.save();

    res.json({ success: true, message: 'Hesabınız başarıyla doğrulandı ve açıldı.' });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Doğrulama hatası.', error: error.message });
  }
});

// ==========================================
// 3. GİRİŞ YAPMA (LOGIN)
// ==========================================
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ success: false, message: 'Kullanıcı bulunamadı.' });
    }

    if (!user.isVerified) {
      return res.status(403).json({ success: false, message: 'Lütfen önce e-postanıza gelen kod ile hesabınızı doğrulayın.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Hatalı şifre.' });
    }

    res.json({ success: true, message: 'Giriş başarılı.', email: user.email });

  } catch (error) {
    res.status(500).json({ success: false, message: 'Giriş hatası.', error: error.message });
  }
});

// ==========================================
// 4. GİZLİ PANEL VE AYARLARI GETİR/GÜNCELLE
// ==========================================
app.get('/api/settings', async (req, res) => {
  const settings = await Settings.findOne();
  res.json({
    isLocked: settings.isLocked,
    extraFee: settings.extraFee,
    bagFeePerItem: settings.bagFeePerItem,
    phoneNumber: settings.phoneNumber
  });
});

// 30 Kez Logoya Basınca Çalışacak Şifre Kontrolü
app.post('/api/admin/verify', async (req, res) => {
  const { pass1, pass2 } = req.body;
  const settings = await Settings.findOne();

  if (pass1 === settings.passwords.pass1 && pass2 === settings.passwords.pass2) {
    return res.json({ success: true, settings });
  }
  res.status(401).json({ success: false, message: "Gizli panel şifreleri hatalı!" });
});

// Gizli Panelden Tüm Ayarları Güncelleme (Şifre, Numara, Kitleme)
app.post('/api/admin/update-settings', async (req, res) => {
  const { pass1, pass2, newPass1, newPass2, phoneNumber, isLocked, extraFee, bagFeePerItem } = req.body;
  const settings = await Settings.findOne();

  if (pass1 !== settings.passwords.pass1 || pass2 !== settings.passwords.pass2) {
    return res.status(401).json({ success: false, message: "Yetkisiz erişim!" });
  }

  if (newPass1) settings.passwords.pass1 = newPass1;
  if (newPass2) settings.passwords.pass2 = newPass2;
  if (phoneNumber !== undefined) settings.phoneNumber = phoneNumber;
  if (typeof isLocked === "boolean") settings.isLocked = isLocked;
  if (extraFee !== undefined) settings.extraFee = Number(extraFee);
  if (bagFeePerItem !== undefined) settings.bagFeePerItem = Number(bagFeePerItem);

  await settings.save();
  res.json({ success: true, message: "Tüm veriler kalıcı olarak güncellendi.", settings });
});

// ==========================================
// 5. MÜŞTERİ SİPARİŞ OLUŞTURMA
// ==========================================
app.post('/api/order', async (req, res) => {
  const settings = await Settings.findOne();

  if (settings.isLocked) {
    return res.status(403).json({ success: false, message: "Sipariş alımı şu anda kilitlidir." });
  }

  const { customerName, customerPhone, address, items, bagCount, notes } = req.body;
  const totalBagFee = (bagCount || 0) * settings.bagFeePerItem;

  const messageText = `📦 YENİ SİPARİŞ!\n` +
    `👤 Müşteri: ${customerName}\n` +
    `📞 Tel: ${customerPhone}\n` +
    `📍 Adres: ${address}\n` +
    `🛒 Alınacaklar: ${items}\n` +
    `🛍️ Poşet: ${bagCount || 0} Adet (${totalBagFee} TL)\n` +
    `💵 Kurye Ek Ücreti: ${settings.extraFee} TL\n` +
    `📝 Not: ${notes || 'Yok'}`;

  const whatsappUrl = `https://wa.me/${settings.phoneNumber}?text=${encodeURIComponent(messageText)}`;

  res.json({ success: true, message: "Sipariş oluşturuldu.", whatsappUrl });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Sunucu ${PORT} portunda çalışıyor.`));
  
