import Image from 'next/image';
import Link from 'next/link';
import {
  QrIcon,
  GlobeIcon,
  ChannelIcon,
  LinkIcon,
  ChartIcon,
  StoreIcon,
  OrdersIcon,
  UsersIcon,
  ShieldIcon,
  BuildingIcon,
  CashierIcon,
  DocIcon,
  CheckIcon,
  WalletIcon,
  RefundIcon,
  ReconcileIcon,
} from '@/components/bunnyera-pay/icons';

// BunnyEra Pay 官网首页：浅色 SaaS 品牌风（Blue / Navy / White）
export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center">
              <Image
                src="/brand/bunnyera-pay/logo/logo-horizontal.png"
                alt="BunnyEra Pay"
                width={404}
                height={64}
                className="h-[38px] w-auto"
                priority
              />
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#products" className="text-slate-600 hover:text-blue-600 text-sm font-medium transition">支付产品</a>
              <a href="#solutions" className="text-slate-600 hover:text-blue-600 text-sm font-medium transition">行业方案</a>
              <a href="#channels" className="text-slate-600 hover:text-blue-600 text-sm font-medium transition">支付渠道</a>
              <a href="#process" className="text-slate-600 hover:text-blue-600 text-sm font-medium transition">接入流程</a>
              <a href="#about" className="text-slate-600 hover:text-blue-600 text-sm font-medium transition">关于我们</a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-slate-600 hover:text-blue-600 text-sm font-medium px-4 py-2 transition">
                登录
              </Link>
              <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium px-5 py-2.5 rounded-lg transition shadow-sm">
                商户入驻
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 bg-blue-600 rounded-full"></span>
                <span className="text-blue-700 text-sm font-medium">多商户支付管理平台</span>
              </div>
              <h1 className="text-4xl md:text-5xl font-bold text-slate-900 leading-tight mb-6">
                统一管理门店与收款<br />
                <span className="text-blue-600">连接持牌支付服务</span>
              </h1>
              <p className="text-slate-600 text-lg leading-relaxed mb-4 max-w-xl">
                BunnyEra Pay 是多商户支付管理平台，统一管理门店、收款码、订单、退款与对账，
                并连接持牌支付服务商完成真实支付与结算。
              </p>
              <p className="text-slate-500 text-sm leading-relaxed mb-8 max-w-xl">
                平台本身不接触资金：所有交易由持牌支付机构处理，资金直接结算到商户企业账户。
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-lg text-base font-semibold transition shadow-sm">
                  免费入驻 →
                </Link>
                <Link href="/docs" className="border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-600 px-8 py-3.5 rounded-lg text-base font-semibold transition bg-white">
                  查看接入文档
                </Link>
              </div>
              <div className="flex items-center gap-6 mt-8 text-sm text-slate-500">
                <span className="flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-green-600" /> 持牌机构清算</span>
                <span className="flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-green-600" /> 多商户数据隔离</span>
                <span className="flex items-center gap-1.5"><CheckIcon className="w-4 h-4 text-green-600" /> 全流程对账</span>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
                <div className="flex items-center justify-between mb-4">
                  <span className="text-slate-900 font-semibold">今日交易概览</span>
                  <span className="text-slate-400 text-xs">界面示意 · 示例数据</span>
                </div>
                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div className="bg-blue-50 rounded-xl p-4">
                    <p className="text-blue-600 text-xs font-medium">今日收入</p>
                    <p className="text-slate-900 text-2xl font-bold mt-1">¥28,456</p>
                  </div>
                  <div className="bg-green-50 rounded-xl p-4">
                    <p className="text-green-600 text-xs font-medium">今日订单</p>
                    <p className="text-slate-900 text-2xl font-bold mt-1">186</p>
                  </div>
                </div>
                <div className="space-y-3">
                  {[
                    { name: '支付宝', pct: '53.5%', color: 'bg-blue-600' },
                    { name: '微信支付', pct: '35.6%', color: 'bg-green-600' },
                    { name: '云闪付', pct: '10.9%', color: 'bg-red-500' },
                  ].map(item => (
                    <div key={item.name} className="flex items-center gap-3">
                      <span className="text-slate-600 text-sm w-16">{item.name}</span>
                      <div className="flex-1 bg-slate-100 rounded-full h-2">
                        <div className={`${item.color} h-2 rounded-full`} style={{ width: item.pct }}></div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 平台能力概览（中性能力表达，不写未经确认的营销数字） */}
      <section className="py-12 bg-white border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { Icon: BuildingIcon, label: '多商户管理', desc: '一主体多品牌多分店' },
              { Icon: QrIcon, label: '分店收款码', desc: '分店独立聚合码' },
              { Icon: OrdersIcon, label: '订单与退款', desc: '全生命周期追踪' },
              { Icon: ReconcileIcon, label: '对账结算', desc: '渠道账单核对' },
            ].map(item => (
              <div key={item.label}>
                <span className="w-10 h-10 mx-auto mb-3 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <item.Icon className="w-5 h-5" />
                </span>
                <p className="text-slate-900 font-semibold">{item.label}</p>
                <p className="text-slate-500 text-sm mt-1">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 支付产品 */}
      <section id="products" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">支付产品</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">覆盖线上线下全场景，满足各类商户收款需求</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                Icon: QrIcon,
                title: '扫码支付',
                desc: '支持支付宝、微信支付、云闪付扫码付款。顾客打开任意支付 App 扫码即可完成支付，适用于餐饮、零售、便利店等线下场景。',
                tags: ['当面付', '主扫', '被扫'],
              },
              {
                Icon: GlobeIcon,
                title: '在线支付',
                desc: 'PC 网站、H5 页面、小程序内嵌支付。支持电脑网站支付、手机网站支付、JSAPI 支付等多种接入方式。',
                tags: ['PC 网站', 'H5', '小程序'],
              },
              {
                Icon: ChannelIcon,
                title: '银行卡支付',
                desc: '银联在线网关支付，支持借记卡和信用卡。云闪付 App 扫码支付，覆盖主流银行用户群体。',
                tags: ['银联网关', '云闪付', '信用卡'],
              },
              {
                Icon: GlobeIcon,
                title: '跨境支付',
                desc: '预留 Visa / Mastercard、PayPal、Antom 等跨境渠道接入能力，助力商户拓展全球市场。',
                tags: ['Visa', 'PayPal', 'Antom'],
              },
              {
                Icon: LinkIcon,
                title: '聚合收款码',
                desc: '一码多付，一个二维码同时支持支付宝、微信、云闪付。顾客扫码后选择支付方式，简化收银流程。',
                tags: ['一码多付', '分店独立'],
              },
              {
                Icon: ChartIcon,
                title: '经营分析',
                desc: '实时交易数据看板，多维度经营分析报表。按门店、渠道、时间段统计交易数据，助力商户精准决策。',
                tags: ['数据看板', '分店汇总', '报表'],
              },
            ].map(product => (
              <div key={product.title} className="bg-white rounded-2xl p-8 border border-slate-200 hover:border-blue-200 hover:shadow-sm transition">
                <span className="w-11 h-11 mb-4 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <product.Icon className="w-5 h-5" />
                </span>
                <h3 className="text-xl font-bold text-slate-900 mb-3">{product.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed mb-4">{product.desc}</p>
                <div className="flex flex-wrap gap-2">
                  {product.tags.map(tag => (
                    <span key={tag} className="bg-blue-50 text-blue-600 text-xs px-2.5 py-1 rounded-full font-medium">{tag}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 支付渠道 */}
      <section id="channels" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">连接的支付渠道</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">通过持牌支付机构处理资金，安全合规</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { name: '支付宝', desc: '当面付 / 电脑 / H5', color: 'bg-blue-600', icon: '支' },
              { name: '微信支付', desc: 'Native / H5 / JSAPI', color: 'bg-green-600', icon: '微' },
              { name: '银联/云闪付', desc: '网关 / WAP / 二维码', color: 'bg-red-500', icon: '银' },
              { name: '拉卡拉聚合', desc: '多渠道统一接入', color: 'bg-orange-500', icon: '拉' },
              { name: '数字人民币', desc: '合作机构接入', color: 'bg-amber-500', icon: '数' },
              { name: 'Visa/Mastercard', desc: '外卡收单（预留）', color: 'bg-indigo-600', icon: 'V' },
              { name: 'PayPal', desc: '海外商城（预留）', color: 'bg-sky-600', icon: 'P' },
              { name: 'Antom', desc: '跨境支付（预留）', color: 'bg-purple-600', icon: 'A' },
            ].map(item => (
              <div key={item.name} className="bg-slate-50 rounded-xl p-6 hover:bg-white hover:shadow-sm border border-slate-200 transition">
                <div className={`w-12 h-12 rounded-xl ${item.color} flex items-center justify-center mb-3`}>
                  <span className="text-white font-bold text-lg">{item.icon}</span>
                </div>
                <h3 className="text-slate-900 font-semibold mb-1">{item.name}</h3>
                <p className="text-slate-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 行业方案 */}
      <section id="solutions" className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">行业解决方案</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">针对不同行业特点，提供定制化支付方案</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { Icon: StoreIcon, name: '餐饮美食', features: ['扫码点餐支付', '分桌结算', '会员储值'] },
              { Icon: OrdersIcon, name: '零售便利', features: ['快速收银', '库存联动', '促销管理'] },
              { Icon: BuildingIcon, name: '酒店住宿', features: ['预授权', '押金管理', '离店结算'] },
              { Icon: DocIcon, name: '教育培训', features: ['课程缴费', '分期支付', '退费管理'] },
              { Icon: ShieldIcon, name: '医疗健康', features: ['挂号缴费', '医保对接', '账单管理'] },
              { Icon: WalletIcon, name: '休闲娱乐', features: ['会员充值', '套餐购买', '核销管理'] },
              { Icon: CashierIcon, name: '出行交通', features: ['行程支付', '动态计价', '自动分账'] },
              { Icon: GlobeIcon, name: '跨境电商', features: ['多币种结算', '外卡收单', '汇率管理'] },
            ].map(solution => (
              <div key={solution.name} className="bg-white rounded-xl p-6 border border-slate-200 hover:shadow-sm transition">
                <span className="w-10 h-10 mb-3 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <solution.Icon className="w-5 h-5" />
                </span>
                <h3 className="text-slate-900 font-semibold mb-3">{solution.name}</h3>
                <ul className="space-y-1.5">
                  {solution.features.map(f => (
                    <li key={f} className="text-slate-500 text-sm flex items-center gap-2">
                      <span className="w-1 h-1 bg-blue-500 rounded-full"></span>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 接入流程 */}
      <section id="process" className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">接入流程</h2>
            <p className="text-slate-500 text-lg max-w-2xl mx-auto">四步完成接入，快速开始收款</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '01', title: '注册入驻', desc: '填写企业信息，提交营业执照和法人资料', Icon: DocIcon },
              { step: '02', title: '平台审核', desc: '平台管理员审核资质，审核通过后开通商户', Icon: ShieldIcon },
              { step: '03', title: '渠道配置', desc: '配置支付宝、微信等支付渠道的商户密钥', Icon: ChannelIcon },
              { step: '04', title: '开始收款', desc: '生成收款码，部署收银台，正式营业', Icon: QrIcon },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-blue-50 text-blue-600 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <item.Icon className="w-7 h-7" />
                </div>
                <span className="text-blue-600 text-sm font-bold">{item.step}</span>
                <h3 className="text-slate-900 font-semibold text-lg mt-1 mb-2">{item.title}</h3>
                <p className="text-slate-500 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 平台能力 */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">平台核心能力</h2>
            <p className="text-slate-500 text-lg">完整的支付管理 SaaS 平台</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { Icon: BuildingIcon, title: '多商户隔离', desc: '每个营业执照对应独立商户空间，数据完全隔离，独立支付商户号、独立结算账户' },
              { Icon: CashierIcon, title: '统一收银台', desc: '固定入口码和动态订单码，支持扫码支付、在线支付、H5支付等多种场景' },
              { Icon: OrdersIcon, title: '订单管理', desc: '完整的订单生命周期管理，创建、支付、查单、关单、退款、对账全流程追踪' },
              { Icon: StoreIcon, title: '门店管理', desc: '支持多品牌、多门店、多部门、多收银台的层级管理架构' },
              { Icon: UsersIcon, title: '员工权限', desc: '多种角色精细权限控制，法人、管理员、财务、店长、收银员各司其职' },
              { Icon: RefundIcon, title: '退款与对账', desc: '退款申请审核流程、渠道账单核对，全流程留痕可追溯' },
            ].map(feature => (
              <div key={feature.title} className="bg-white rounded-2xl p-8 border border-slate-200 hover:shadow-sm transition">
                <span className="w-11 h-11 mb-4 bg-blue-50 text-blue-600 rounded-lg flex items-center justify-center">
                  <feature.Icon className="w-5 h-5" />
                </span>
                <h3 className="text-slate-900 font-bold text-lg mb-2">{feature.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 资金安全保障（Navy 底，不使用大面积渐变） */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-slate-900 rounded-3xl p-10 md:p-14 text-white">
            <h2 className="text-3xl font-bold mb-8">资金安全保障</h2>
            <div className="grid md:grid-cols-2 gap-8">
              <div>
                <ul className="space-y-4">
                  {[
                    'BunnyEra Pay 仅提供支付管理软件和技术服务',
                    '所有资金由持牌支付机构直接结算到商户企业账户',
                    '平台不沉淀、归集或兑换客户资金',
                    '不自行进行人民币兑美元或其他货币兑换',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="w-5 h-5 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckIcon className="w-3 h-3 text-white" />
                      </span>
                      <span className="text-slate-200">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <ul className="space-y-4">
                  {[
                    '遵循国务院《非银行支付机构监督管理条例》',
                    '每张营业执照独立支付通道，不共用收款账户',
                    '完整审计日志，所有操作可追溯',
                    '运营主体：BUNNYERA LLC',
                  ].map(item => (
                    <li key={item} className="flex items-start gap-3">
                      <span className="w-5 h-5 bg-white/15 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <CheckIcon className="w-3 h-3 text-white" />
                      </span>
                      <span className="text-slate-200">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-4">准备好开始了吗？</h2>
          <p className="text-slate-500 text-lg mb-8">免费入驻，快速接入，让收款管理更简单</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-lg text-base font-semibold transition shadow-sm">
              立即申请入驻
            </Link>
            <Link href="/docs" className="border border-slate-200 hover:border-blue-300 text-slate-700 hover:text-blue-600 px-8 py-3.5 rounded-lg text-base font-semibold transition bg-white">
              查看接入文档
            </Link>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer id="about" className="bg-slate-900 text-slate-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid md:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center mb-4">
                <Image
                  src="/brand/bunnyera-pay/logo/logo-horizontal-white.png"
                  alt="BunnyEra Pay"
                  width={404}
                  height={64}
                  className="h-8 w-auto"
                />
              </div>
              <p className="text-slate-400 text-sm leading-relaxed">多商户支付管理平台</p>
              <p className="text-slate-500 text-xs mt-3">运营主体：BUNNYERA LLC</p>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">产品</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="#products" className="hover:text-white transition">支付收款</a></li>
                <li><a href="#channels" className="hover:text-white transition">跨境支付</a></li>
                <li><a href="#products" className="hover:text-white transition">外卡服务</a></li>
                <li><a href="#products" className="hover:text-white transition">经营分析</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">支持</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="/docs" className="hover:text-white transition">接入文档</a></li>
                <li><a href="#" className="hover:text-white transition">帮助中心</a></li>
                <li><a href="/register" className="hover:text-white transition">商户入驻</a></li>
                <li><a href="#" className="hover:text-white transition">联系我们</a></li>
              </ul>
            </div>
            <div>
              <h4 className="text-white font-semibold mb-4">法律</h4>
              <ul className="space-y-2.5 text-sm">
                <li><a href="/terms" className="hover:text-white transition">用户协议</a></li>
                <li><a href="/privacy" className="hover:text-white transition">隐私政策</a></li>
                <li><a href="/merchant-agreement" className="hover:text-white transition">商户服务协议</a></li>
                <li><a href="/compliance" className="hover:text-white transition">风险与合规说明</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 mt-10 pt-8 text-center text-xs text-slate-500">
            © {new Date().getFullYear()} BUNNYERA LLC. BunnyEra Pay 是支付管理软件，不是银行或支付机构。
            所有支付交易由持牌支付机构处理。
          </div>
        </div>
      </footer>
    </div>
  );
}
