import Link from 'next/link';

export default function HomePage() {
  return (
    <div className="min-h-screen bg-white">
      {/* 导航栏 */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-white/95 backdrop-blur border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">B</span>
              </div>
              <span className="text-gray-900 font-bold text-lg">BunnyEra Pay</span>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <a href="#products" className="text-gray-600 hover:text-blue-600 text-sm font-medium transition">支付产品</a>
              <a href="#solutions" className="text-gray-600 hover:text-blue-600 text-sm font-medium transition">行业方案</a>
              <a href="#channels" className="text-gray-600 hover:text-blue-600 text-sm font-medium transition">支付渠道</a>
              <a href="#process" className="text-gray-600 hover:text-blue-600 text-sm font-medium transition">接入流程</a>
              <a href="#about" className="text-gray-600 hover:text-blue-600 text-sm font-medium transition">关于我们</a>
            </div>
            <div className="flex items-center gap-3">
              <Link href="/login" className="text-gray-600 hover:text-blue-600 text-sm font-medium px-4 py-2 transition">
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
      <section className="pt-32 pb-20 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-6">
                <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                <span className="text-blue-700 text-sm font-medium">多商户支付管理 SaaS 平台</span>
              </div>
              <h1 className="text-4xl md:text-5xl lg:text-6xl font-bold text-gray-900 leading-tight mb-6">
                一站式聚合支付<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-600 to-indigo-600">
                  让收款更简单
                </span>
              </h1>
              <p className="text-gray-600 text-lg leading-relaxed mb-8 max-w-xl">
                BunnyEra Pay 为商户提供统一收银、订单管理、退款对账和经营分析能力。
                连接支付宝、微信支付、银联等持牌支付机构，资金由支付机构直接结算到商户企业账户。
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-xl text-base font-semibold transition shadow-lg shadow-blue-600/20">
                  免费入驻 →
                </Link>
                <Link href="/docs" className="border border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-600 px-8 py-3.5 rounded-xl text-base font-semibold transition bg-white">
                  查看接入文档
                </Link>
              </div>
              <div className="flex items-center gap-6 mt-8 text-sm text-gray-500">
                <span className="flex items-center gap-1.5">✓ 零手续费入驻</span>
                <span className="flex items-center gap-1.5">✓ 最快 T+1 结算</span>
                <span className="flex items-center gap-1.5">✓ 持牌机构清算</span>
              </div>
            </div>
            <div className="hidden lg:block">
              <div className="relative">
                <div className="bg-white rounded-2xl shadow-2xl shadow-blue-900/10 border border-gray-100 p-6">
                  <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-900 font-semibold">今日交易概览</span>
                    <span className="text-green-600 text-sm font-medium">↑ 12.5%</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-blue-50 rounded-xl p-4">
                      <p className="text-blue-600 text-xs font-medium">今日收入</p>
                      <p className="text-blue-900 text-2xl font-bold mt-1">¥28,456</p>
                    </div>
                    <div className="bg-green-50 rounded-xl p-4">
                      <p className="text-green-600 text-xs font-medium">今日订单</p>
                      <p className="text-green-900 text-2xl font-bold mt-1">186</p>
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { name: '支付宝', amount: '¥15,230', pct: '53.5%', color: 'bg-blue-500' },
                      { name: '微信支付', amount: '¥10,126', pct: '35.6%', color: 'bg-green-500' },
                      { name: '云闪付', amount: '¥3,100', pct: '10.9%', color: 'bg-red-500' },
                    ].map(item => (
                      <div key={item.name} className="flex items-center gap-3">
                        <span className="text-gray-600 text-sm w-16">{item.name}</span>
                        <div className="flex-1 bg-gray-100 rounded-full h-2">
                          <div className={`${item.color} h-2 rounded-full`} style={{ width: item.pct }}></div>
                        </div>
                        <span className="text-gray-900 text-sm font-medium w-20 text-right">{item.amount}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="absolute -top-4 -right-4 w-24 h-24 bg-blue-100 rounded-full opacity-60"></div>
                <div className="absolute -bottom-6 -left-6 w-32 h-32 bg-indigo-100 rounded-full opacity-40"></div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 数据统计 */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-8 text-center">
            {[
              { value: '8+', label: '支付渠道' },
              { value: '9', label: '角色权限' },
              { value: 'T+1', label: '结算周期' },
              { value: '99.9%', label: '系统可用性' },
            ].map(stat => (
              <div key={stat.label}>
                <p className="text-3xl md:text-4xl font-bold text-blue-600">{stat.value}</p>
                <p className="text-gray-500 text-sm mt-1">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 支付产品 */}
      <section id="products" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">支付产品</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">覆盖线上线下全场景，满足各类商户收款需求</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: '📱',
                title: '扫码支付',
                desc: '支持支付宝、微信支付、云闪付扫码付款。顾客打开任意支付 App 扫码即可完成支付，适用于餐饮、零售、便利店等线下场景。',
                tags: ['当面付', '主扫', '被扫'],
              },
              {
                icon: '🌐',
                title: '在线支付',
                desc: 'PC 网站、H5 页面、小程序内嵌支付。支持电脑网站支付、手机网站支付、JSAPI 支付等多种接入方式。',
                tags: ['PC 网站', 'H5', '小程序'],
              },
              {
                icon: '💳',
                title: '银行卡支付',
                desc: '银联在线网关支付，支持借记卡和信用卡。云闪付 App 扫码支付，覆盖主流银行用户群体。',
                tags: ['银联网关', '云闪付', '信用卡'],
              },
              {
                icon: '🌍',
                title: '跨境支付',
                desc: 'Visa / Mastercard 外卡收单，PayPal 海外商城支付，Antom 跨境支付宝。助力商户拓展全球市场。',
                tags: ['Visa', 'PayPal', 'Antom'],
              },
              {
                icon: '🔗',
                title: '聚合收款码',
                desc: '一码多付，一个二维码同时支持支付宝、微信、云闪付。顾客扫码后自动识别支付方式，简化收银流程。',
                tags: ['一码多付', '智能识别'],
              },
              {
                icon: '📊',
                title: '经营分析',
                desc: '实时交易数据看板，多维度经营分析报表。按门店、渠道、时间段统计交易数据，助力商户精准决策。',
                tags: ['数据看板', '趋势分析', '报表导出'],
              },
            ].map(product => (
              <div key={product.title} className="bg-white rounded-2xl p-8 border border-gray-100 hover:border-blue-200 hover:shadow-lg transition group">
                <span className="text-4xl mb-4 block">{product.icon}</span>
                <h3 className="text-xl font-bold text-gray-900 mb-3">{product.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed mb-4">{product.desc}</p>
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">支持的支付渠道</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">通过持牌支付机构处理资金，安全合规</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { name: '支付宝', desc: '当面付 / 电脑 / H5', color: 'from-blue-500 to-blue-600', icon: '支' },
              { name: '微信支付', desc: 'Native / H5 / JSAPI', color: 'from-green-500 to-green-600', icon: '微' },
              { name: '银联/云闪付', desc: '网关 / WAP / 二维码', color: 'from-red-500 to-red-600', icon: '银' },
              { name: '拉卡拉聚合', desc: '多渠道统一接入', color: 'from-orange-500 to-orange-600', icon: '拉' },
              { name: '数字人民币', desc: '合作机构接入', color: 'from-amber-500 to-amber-600', icon: '数' },
              { name: 'Visa/Mastercard', desc: '外卡收单', color: 'from-indigo-500 to-indigo-600', icon: 'V' },
              { name: 'PayPal', desc: '海外商城', color: 'from-sky-500 to-sky-600', icon: 'P' },
              { name: 'Antom', desc: '跨境支付宝', color: 'from-purple-500 to-purple-600', icon: 'A' },
            ].map(item => (
              <div key={item.name} className="bg-gray-50 rounded-xl p-6 hover:bg-white hover:shadow-md border border-gray-100 transition">
                <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${item.color} flex items-center justify-center mb-3`}>
                  <span className="text-white font-bold text-lg">{item.icon}</span>
                </div>
                <h3 className="text-gray-900 font-semibold mb-1">{item.name}</h3>
                <p className="text-gray-400 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 行业方案 */}
      <section id="solutions" className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">行业解决方案</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">针对不同行业特点，提供定制化支付方案</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: '🍜', name: '餐饮美食', features: ['扫码点餐支付', '分桌结算', '会员储值'] },
              { icon: '🛍️', name: '零售便利', features: ['快速收银', '库存联动', '促销管理'] },
              { icon: '🏨', name: '酒店住宿', features: ['预授权', '押金管理', '离店结算'] },
              { icon: '', name: '教育培训', features: ['课程缴费', '分期支付', '退费管理'] },
              { icon: '🏥', name: '医疗健康', features: ['挂号缴费', '医保对接', '账单管理'] },
              { icon: '🎮', name: '休闲娱乐', features: ['会员充值', '套餐购买', '核销管理'] },
              { icon: '🚗', name: '出行交通', features: ['行程支付', '动态计价', '自动分账'] },
              { icon: '🌐', name: '跨境电商', features: ['多币种结算', '外卡收单', '汇率管理'] },
            ].map(solution => (
              <div key={solution.name} className="bg-white rounded-xl p-6 border border-gray-100 hover:shadow-md transition">
                <span className="text-3xl mb-3 block">{solution.icon}</span>
                <h3 className="text-gray-900 font-semibold mb-3">{solution.name}</h3>
                <ul className="space-y-1.5">
                  {solution.features.map(f => (
                    <li key={f} className="text-gray-500 text-sm flex items-center gap-2">
                      <span className="w-1 h-1 bg-blue-400 rounded-full"></span>
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
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">接入流程</h2>
            <p className="text-gray-500 text-lg max-w-2xl mx-auto">四步完成接入，快速开始收款</p>
          </div>
          <div className="grid md:grid-cols-4 gap-8">
            {[
              { step: '01', title: '注册入驻', desc: '填写企业信息，提交营业执照和法人资料', icon: '' },
              { step: '02', title: '平台审核', desc: '平台管理员审核资质，通常 1-3 个工作日', icon: '🔍' },
              { step: '03', title: '渠道配置', desc: '配置支付宝、微信等支付渠道的商户密钥', icon: '⚙️' },
              { step: '04', title: '开始收款', desc: '生成收款码，部署收银台，正式营业', icon: '' },
            ].map(item => (
              <div key={item.step} className="text-center">
                <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <span className="text-3xl">{item.icon}</span>
                </div>
                <span className="text-blue-600 text-sm font-bold">{item.step}</span>
                <h3 className="text-gray-900 font-semibold text-lg mt-1 mb-2">{item.title}</h3>
                <p className="text-gray-500 text-sm">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 平台能力 */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-14">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">平台核心能力</h2>
            <p className="text-gray-500 text-lg">完整的支付管理 SaaS 平台</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              { icon: '🏢', title: '多商户隔离', desc: '每个营业执照对应独立商户空间，数据完全隔离，独立支付商户号、独立结算账户' },
              { icon: '💳', title: '统一收银台', desc: '固定入口码和动态订单码，支持扫码支付、在线支付、H5支付等多种场景' },
              { icon: '📋', title: '订单管理', desc: '完整的订单生命周期管理，创建、支付、查单、关单、退款、对账全流程追踪' },
              { icon: '🏪', title: '门店管理', desc: '支持多品牌、多门店、多部门、多收银台的层级管理架构' },
              { icon: '', title: '员工权限', desc: '9种角色精细权限控制，法人、管理员、财务、店长、收银员各司其职' },
              { icon: '🔒', title: '安全合规', desc: '回调签名验证、幂等处理、审计日志、敏感数据脱敏，符合中国支付监管要求' },
            ].map(feature => (
              <div key={feature.title} className="bg-white rounded-2xl p-8 border border-gray-100 hover:shadow-lg transition">
                <span className="text-3xl mb-4 block">{feature.icon}</span>
                <h3 className="text-gray-900 font-bold text-lg mb-2">{feature.title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 资金安全保障 */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-gradient-to-br from-blue-600 to-indigo-700 rounded-3xl p-10 md:p-14 text-white">
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
                      <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white text-xs font-bold">✓</span>
                      </span>
                      <span className="text-blue-50">{item}</span>
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
                      <span className="w-5 h-5 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                        <span className="text-white text-xs font-bold">✓</span>
                      </span>
                      <span className="text-blue-50">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">准备好开始了吗？</h2>
          <p className="text-gray-500 text-lg mb-8">免费入驻，快速接入，让收款更简单</p>
          <div className="flex flex-wrap items-center justify-center gap-4">
            <Link href="/register" className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3.5 rounded-xl text-base font-semibold transition shadow-lg shadow-blue-600/20">
              立即申请入驻
            </Link>
            <Link href="/docs" className="border border-gray-200 hover:border-blue-300 text-gray-700 hover:text-blue-600 px-8 py-3.5 rounded-xl text-base font-semibold transition bg-white">
              查看接入文档
            </Link>
          </div>
        </div>
      </section>

      {/* 页脚 */}
      <footer id="about" className="bg-gray-900 text-gray-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-14">
          <div className="grid md:grid-cols-4 gap-10">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-sm">B</span>
                </div>
                <span className="text-white font-bold text-lg">BunnyEra Pay</span>
              </div>
              <p className="text-gray-400 text-sm leading-relaxed">多商户支付管理 SaaS 平台</p>
              <p className="text-gray-500 text-xs mt-3">运营主体：BUNNYERA LLC</p>
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
          <div className="border-t border-gray-800 mt-10 pt-8 text-center text-xs text-gray-500">
            © {new Date().getFullYear()} BUNNYERA LLC. BunnyEra Pay 是支付管理软件，不是银行或支付机构。
            所有支付交易由持牌支付机构处理。
          </div>
        </div>
      </footer>
    </div>
  );
}
