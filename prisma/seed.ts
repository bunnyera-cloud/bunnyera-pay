// 数据库种子脚本：创建初始管理员和示范数据
// ⚠️ 安全警告：此脚本仅限开发环境使用
// 生产环境必须通过环境变量传入密码，禁止使用默认密码
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  // 生产环境安全守卫：禁止在生产环境执行种子脚本
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ 安全限制：种子脚本禁止在生产环境 (NODE_ENV=production) 执行。');
    console.error('   如需初始化数据，请使用迁移脚本或通过管理后台手动创建。');
    process.exit(1);
  }

  // 额外安全检查：如果环境变量明确标记为生产环境，也阻止执行
  if (process.env.SEED_DISABLED === 'true') {
    console.error('❌ 种子脚本已被禁用 (SEED_DISABLED=true)。');
    process.exit(1);
  }

  console.log('============================================');
  console.log('  BunnyEra Pay 种子数据初始化（开发环境）');
  console.log('============================================\n');

  // ---- 平台超级管理员 ----
  // 开发环境：必须通过 ADMIN_EMAIL 和 ADMIN_PASSWORD 环境变量设置
  // 不再提供任何默认密码
  const adminEmail = process.env.ADMIN_EMAIL;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!adminEmail || !adminPassword) {
    console.warn('⚠️  跳过管理员创建：请设置环境变量 ADMIN_EMAIL 和 ADMIN_PASSWORD');
    console.warn('   示例: ADMIN_EMAIL=admin@example.com ADMIN_PASSWORD=YourStrongPassword npx tsx prisma/seed.ts\n');
  } else {
    const existingAdmin = await prisma.platformUser.findUnique({ where: { email: adminEmail } });
    if (!existingAdmin) {
      const passwordHash = await bcrypt.hash(adminPassword, 12);
      await prisma.platformUser.create({
        data: {
          email: adminEmail,
          passwordHash,
          name: '系统管理员',
          role: 'PLATFORM_SUPER_ADMIN',
          isActive: true,
        },
      });
      console.log(`✓ 平台管理员创建成功: ${adminEmail}`);
    } else {
      console.log(`- 管理员 ${adminEmail} 已存在，跳过`);
    }
  }

  // ---- 平台审核员 ----
  const reviewerEmail = process.env.REVIEWER_EMAIL;
  const reviewerPassword = process.env.REVIEWER_PASSWORD;

  if (!reviewerEmail || !reviewerPassword) {
    console.warn('⚠️  跳过审核员创建：请设置环境变量 REVIEWER_EMAIL 和 REVIEWER_PASSWORD\n');
  } else {
    const existingReviewer = await prisma.platformUser.findUnique({ where: { email: reviewerEmail } });
    if (!existingReviewer) {
      const passwordHash = await bcrypt.hash(reviewerPassword, 12);
      await prisma.platformUser.create({
        data: {
          email: reviewerEmail,
          passwordHash,
          name: '商户审核员',
          role: 'PLATFORM_REVIEWER',
          isActive: true,
        },
      });
      console.log(`✓ 审核员创建成功: ${reviewerEmail}`);
    } else {
      console.log(`- 审核员 ${reviewerEmail} 已存在，跳过`);
    }
  }

  // ---- 系统配置（非敏感数据，可直接初始化） ----
  const configs = [
    { key: 'platform_name', value: 'BunnyEra Pay', category: 'general' },
    { key: 'platform_version', value: '1.0.0', category: 'general' },
    { key: 'default_order_expire_minutes', value: 15, category: 'payment' },
    { key: 'refund_auto_approve_limit', value: 1000, category: 'refund' },
    { key: 'reconciliation_auto_run_time', value: '02:00', category: 'reconciliation' },
  ];

  for (const config of configs) {
    await prisma.systemConfig.upsert({
      where: { key: config.key },
      update: {},
      create: config,
    });
  }
  console.log('✓ 系统配置初始化完成');

  // ---- 示范商户 ----
  // 商户账号密码同样需要环境变量，不提供默认密码
  const demoMerchantEmail = process.env.DEMO_MERCHANT_EMAIL;
  const demoMerchantPassword = process.env.DEMO_MERCHANT_PASSWORD;
  const demoCompanyName = process.env.DEMO_COMPANY_NAME || '示范商户';
  const demoRegistrationNo = process.env.DEMO_REGISTRATION_NO || '000000000000000000';
  const demoLegalPerson = process.env.DEMO_LEGAL_PERSON || '示范法人';

  if (!demoMerchantEmail || !demoMerchantPassword) {
    console.warn('⚠️  跳过示范商户创建：请设置环境变量 DEMO_MERCHANT_EMAIL 和 DEMO_MERCHANT_PASSWORD\n');
  } else {
    const existingMerchant = await prisma.merchant.findFirst({
      where: { email: demoMerchantEmail },
    });

    if (!existingMerchant) {
      const merchant = await prisma.merchant.create({
        data: {
          merchantNo: `MEP${Date.now()}`,
          country: 'CN',
          companyName: demoCompanyName,
          registrationNo: demoRegistrationNo,
          legalPerson: demoLegalPerson,
          email: demoMerchantEmail,
          phoneCode: '+86',
          phone: process.env.DEMO_PHONE || '00000000000',
          registeredAddress: process.env.DEMO_ADDRESS || '示范地址',
          businessCategory: 'ecommerce',
          status: 'DRAFT',
          agreementAccepted: true,
          agreementVersion: '1.0',
        },
      });

      const passwordHash = await bcrypt.hash(demoMerchantPassword, 12);
      await prisma.merchantMember.create({
        data: {
          merchantId: merchant.id,
          email: demoMerchantEmail,
          name: demoLegalPerson,
          phone: process.env.DEMO_PHONE || '00000000000',
          passwordHash,
          role: 'MERCHANT_OWNER',
          isActive: true,
        },
      });

      // 创建默认品牌和门店结构
      const brand = await prisma.brand.create({
        data: { merchantId: merchant.id, name: demoCompanyName, code: 'DEFAULT' },
      });

      const store = await prisma.store.create({
        data: { brandId: brand.id, name: '一号门店', code: 'STORE01' },
      });

      await prisma.department.createMany({
        data: [
          { storeId: store.id, name: '前台', code: 'FRONT' },
          { storeId: store.id, name: '客服', code: 'SERVICE' },
        ],
      });

      console.log(`✓ 示范商户创建成功: ${demoMerchantEmail}`);
    } else {
      console.log(`- 示范商户 ${demoMerchantEmail} 已存在，跳过`);
    }
  }

  console.log('\n========================================');
  console.log('种子数据初始化完成');
  console.log('========================================\n');
}

main()
  .catch((e) => {
    console.error('种子数据初始化失败:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
