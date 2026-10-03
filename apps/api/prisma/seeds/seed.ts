/**
 * KROTO seed script (PHASE 1) — idempotent.
 * Creates: categories, products, encrypted inventory codes, admin user (2FA pending),
 * settings (rate lock, confirmations per network, sweep threshold), a launch coupon.
 *
 * Run: npm run db:seed   (or `docker compose up` which runs it automatically)
 */
import { PrismaClient, CouponType, Network } from '@prisma/client';
import { createCipheriv, randomBytes } from 'node:crypto';

const prisma = new PrismaClient();

// ── field-level encryption for secret codes ──────────────────────
// Format stored in DB: base64( iv(12) | tag(16) | ciphertext )
function encryptCode(plaintext: string): string {
  const keyB64 = process.env.CODE_ENCRYPTION_KEY;
  if (!keyB64) throw new Error('CODE_ENCRYPTION_KEY is not set — refusing to seed plaintext secrets');
  const key = Buffer.from(keyB64, 'base64'); // must be 32 bytes
  if (key.length !== 32) throw new Error('CODE_ENCRYPTION_KEY must be 32 bytes (base64)');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString('base64');
}

const last4 = (s: string) => s.slice(-4);

// deterministic-ish fake code generator for demo inventory
function demoCode(prefix: string, i: number): string {
  const chunk = () => randomBytes(2).toString('hex').toUpperCase();
  return `${prefix}-${chunk()}-${chunk()}-${String(i).padStart(4, '0')}`;
}

async function main() {
  console.log('🌱 Seeding KROTO…');

  // ── Settings (editable later from the admin panel) ────────────
  const settings: Array<{ key: string; value: unknown; valueType: string; group: string; description: string }> = [
    { key: 'payments.rate_lock_minutes', value: 15, valueType: 'number', group: 'payments', description: 'عدد الدقائق التي يُثبَّت فيها سعر الصرف بعد إنشاء الفاتورة' },
    { key: 'payments.invoice_ttl_minutes', value: 30, valueType: 'number', group: 'payments', description: 'صالونية الفاتورة قبل الانتهاء وإمكانية إعادة التسعير' },
    { key: 'payments.provider', value: 'btcpay', valueType: 'string', group: 'payments', description: 'مزوّد الدفع: btcpay | nowpayments' },
    { key: 'payments.confirmations.BTC', value: 3, valueType: 'number', group: 'payments', description: 'BTC — عدد التأكيدات المطلوبة' },
    { key: 'payments.confirmations.ETH', value: 12, valueType: 'number', group: 'payments', description: 'ETH — عدد التأكيدات المطلوبة' },
    { key: 'payments.confirmations.TRON', value: 20, valueType: 'number', group: 'payments', description: 'TRON (USDT-TRC20) — عدد التأكيدات المطلوبة' },
    { key: 'payments.confirmations.SOLANA', value: 32, valueType: 'number', group: 'payments', description: 'SOL — عدد التأكيدات المطلوبة' },
    { key: 'payments.confirmations.BNB_CHAIN', value: 15, valueType: 'number', group: 'payments', description: 'BNB Smart Chain — عدد التأكيدات المطلوبة' },
    { key: 'payments.usdt_trc20_currency', value: 'USDT', valueType: 'string', group: 'payments', description: 'رمز USDT' },
    { key: 'wallet.sweep_threshold_usd', value: 500, valueType: 'number', group: 'wallet', description: 'عتبة المحفظة الساخنة بالدولار لتفعيل كنس الأرصدة للمحفظة الباردة' },
    { key: 'notify.telegram_enabled', value: false, valueType: 'boolean', group: 'notifications', description: 'تنبيهات تيليجرام للطلبات المؤكدة' },
    { key: 'store.currency', value: 'USD', valueType: 'string', group: 'general', description: 'عملة العرض الأساسية' },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { key: s.key },
      update: {}, // never clobber admin edits on re-seed
      create: { key: s.key, value: JSON.parse(JSON.stringify(s.value)), valueType: s.valueType, group: s.group, description: s.description },
    });
  }

  // ── Admin user (password: change via admin UI; TOTP setup required at first login) ──
  // bcrypt hash of "KrotoAdmin#2026" placeholder — rotate immediately after boot.
  const adminEmail = 'admin@kroto.local';
  await prisma.user.upsert({
    where: { email: adminEmail },
    update: {},
    create: {
      email: adminEmail,
      passwordHash: '$2b$12$C8Qm3l0Uq3G9r1oXwJ0Z7e6tQ6xhL2pT4vN8kD5wF3yB7aH9cE2uS', // CHANGE ME
      fullNameAr: 'مدير كروتو',
      fullNameEn: 'KROTO Admin',
      role: 'SUPER_ADMIN',
    },
  });

  // ── Categories ────────────────────────────────────────────────
  const categories = [
    { slug: 'gift-cards', nameAr: 'بطاقات الهدايا', nameEn: 'Gift Cards', icon: '🎁', sortOrder: 1, descriptionAr: 'بطاقات هدايا للمتاجر والألعاب' },
    { slug: 'game-topups', nameAr: 'تعبئة الألعاب', nameEn: 'Game Top-Ups', icon: '🎮', sortOrder: 2, descriptionAr: 'شحن أرصدة وحسابات الألعاب' },
    { slug: 'subscriptions', nameAr: 'الاشتراكات', nameEn: 'Subscriptions', icon: '📺', sortOrder: 3, descriptionAr: 'نتفلكس، سبوتيفي، يوتيوب بريميوم وغيرها' },
    { slug: 'crypto-vouchers', nameAr: 'قسائم الكريبتو', nameEn: 'Crypto Vouchers', icon: '🪙', sortOrder: 4, descriptionAr: 'قسائم رقمية لشراء العملات الرقمية' },
  ];
  const cat = new Map<string, string>();
  for (const c of categories) {
    const row = await prisma.category.upsert({ where: { slug: c.slug }, update: c, create: c });
    cat.set(c.slug, row.id);
  }

  // ── Products + inventory ──────────────────────────────────────
  type P = { slug: string; brand: string; nameAr: string; nameEn: string; priceUsd: number; compareAtUsd?: number; cat: string; featured?: boolean; networks: Network[]; stock: number; prefix: string };
  const products: P[] = [
    { slug: 'steam-usd-10', brand: 'Steam', nameAr: 'بطاقة ستيم 10 دولار', nameEn: 'Steam Gift Card $10', priceUsd: 10, compareAtUsd: 12, cat: 'gift-cards', featured: true, networks: [Network.TRON, Network.ETH, Network.BNB_CHAIN], stock: 25, prefix: 'STM' },
    { slug: 'steam-usd-25', brand: 'Steam', nameAr: 'بطاقة ستيم 25 دولار', nameEn: 'Steam Gift Card $25', priceUsd: 25, cat: 'gift-cards', networks: [Network.TRON, Network.ETH], stock: 20, prefix: 'ST25' },
    { slug: 'googleplay-usd-15', brand: 'Google Play', nameAr: 'بطاقة جوجل بلاي 15 دولار', nameEn: 'Google Play $15', priceUsd: 15, cat: 'gift-cards', featured: true, networks: [Network.TRON, Network.BTC], stock: 15, prefix: 'GP' },
    { slug: 'itunes-usd-20', brand: 'Apple', nameAr: 'بطاقة آيتونز 20 دولار', nameEn: 'iTunes Gift Card $20', priceUsd: 20, cat: 'gift-cards', networks: [Network.TRON, Network.ETH], stock: 10, prefix: 'IT' },
    { slug: 'pubg-660uc', brand: 'PUBG Mobile', nameAr: 'تعبئة ببجي 660 كويز', nameEn: 'PUBG 660 UC', priceUsd: 9.99, cat: 'game-topups', featured: true, networks: [Network.TRON, Network.BNB_CHAIN], stock: 30, prefix: 'UC660' },
    { slug: 'freefire-100diamonds', brand: 'Garena Free Fire', nameAr: 'تعبئة فري فاير 100 جوهرة', nameEn: 'Free Fire 100 Diamonds', priceUsd: 0.99, cat: 'game-topups', networks: [Network.TRON], stock: 40, prefix: 'FF100' },
    { slug: 'netflix-premium-month', brand: 'Netflix', nameAr: 'اشتراك نتفلكس بريميوم شهر', nameEn: 'Netflix Premium 1 Month', priceUsd: 21.99, compareAtUsd: 25, cat: 'subscriptions', networks: [Network.ETH, Network.TRON, Network.SOLANA], stock: 8, prefix: 'NFX' },
    { slug: 'spotify-month', brand: 'Spotify', nameAr: 'اشتراك سبوتيفاي شهر', nameEn: 'Spotify 1 Month', priceUsd: 10.99, cat: 'subscriptions', networks: [Network.TRON, Network.SOLANA], stock: 12, prefix: 'SPOT' },
    { slug: 'binance-gift-50usdt', brand: 'Binance', nameAr: 'قسيمة بينانس 50 USDT', nameEn: 'Binance Gift Card 50 USDT', priceUsd: 50, cat: 'crypto-vouchers', featured: true, networks: [Network.TRON, Network.ETH, Network.BNB_CHAIN], stock: 5, prefix: 'BIN' },
    { slug: 'bitrefill-credit-25', brand: 'Bitrefill', nameAr: 'رصيد بيتريفيل 25 دولار', nameEn: 'Bitrefill Credit $25', priceUsd: 25, cat: 'crypto-vouchers', networks: [Network.BTC, Network.TRON], stock: 6, prefix: 'BRF' },
  ];

  for (const p of products) {
    const product = await prisma.product.upsert({
      where: { slug: p.slug },
      update: {
        brand: p.brand, nameAr: p.nameAr, nameEn: p.nameEn, priceUsd: p.priceUsd,
        compareAtUsd: p.compareAtUsd ?? null, categoryId: cat.get(p.cat)!,
        isFeatured: !!p.featured, networkHints: p.networks,
      },
      create: {
        slug: p.slug, brand: p.brand, nameAr: p.nameAr, nameEn: p.nameEn,
        priceUsd: p.priceUsd, compareAtUsd: p.compareAtUsd ?? null,
        categoryId: cat.get(p.cat)!, isFeatured: !!p.featured,
        networkHints: p.networks,
        descriptionAr: 'كود رقمي فوري يُسلَّم عبر البريد الإلكتروني خلال دقيقتين من تأكيد الدفع على الشبكة.',
        imageUrls: [`/images/products/${p.slug}.webp`],
      },
    });

    const available = await prisma.inventoryCode.count({ where: { productId: product.id, status: 'AVAILABLE' } });
    if (available < p.stock) {
      const rows = Array.from({ length: p.stock - available }, (_, i) => {
        const code = demoCode(p.prefix, i + 1);
        return { productId: product.id, codeEncrypted: encryptCode(code), codeLast4: last4(code) };
      });
      await prisma.inventoryCode.createMany({ data: rows });
      console.log(`   📦 ${product.slug}: +${rows.length} codes`);
    }
  }

  // ── Launch coupon ─────────────────────────────────────────────
  await prisma.coupon.upsert({
    where: { code: 'KROTO10' },
    update: {},
    create: { code: 'KROTO10', type: CouponType.PERCENT, value: 10, maxRedemptions: 1000, minOrderUsd: 10 },
  });

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
