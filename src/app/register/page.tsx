'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const BUSINESS_CATEGORIES = [
  { value: 'retail', label: '零售' },
  { value: 'food', label: '餐饮' },
  { value: 'hotel', label: '酒店住宿' },
  { value: 'travel', label: '旅游' },
  { value: 'education', label: '教育培训' },
  { value: 'healthcare', label: '医疗健康' },
  { value: 'entertainment', label: '休闲娱乐' },
  { value: 'ecommerce', label: '电子商务' },
  { value: 'services', label: '生活服务' },
  { value: 'technology', label: '科技服务' },
  { value: 'other', label: '其他' },
];

export default function RegisterPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    country: 'CN',
    companyName: '',
    registrationNo: '',
    legalPerson: '',
    email: '',
    phoneCode: '+86',
    phone: '',
    registeredAddress: '',
    businessAddress: '',
    businessCategory: '',
    website: '',
    password: '',
    confirmPassword: '',
    agreementAccepted: false,
  });

  const updateField = (key: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (form.password !== form.confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    if (!form.agreementAccepted) {
      setError('请同意商户服务协议');
      return;
    }

    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/merchants/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          agreementAccepted: true,
          website: form.website || undefined,
          businessAddress: form.businessAddress || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || '注册失败');
        return;
      }

      if (data.data.token) {
        localStorage.setItem('bep_token', data.data.token);
        localStorage.setItem('bep_user', JSON.stringify({
          merchantId: data.data.merchantId,
          merchantNo: data.data.merchantNo,
        }));
        router.push('/dashboard');
      }
    } catch {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-900 via-blue-900 to-slate-900 py-12 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-400 to-purple-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">B</span>
            </div>
            <span className="text-white font-semibold text-xl">BunnyEra Pay</span>
          </Link>
          <h1 className="text-white text-2xl font-bold mt-4">商户入驻申请</h1>
          <p className="text-gray-400 mt-1">请填写您的企业信息，提交后我们将尽快审核</p>
        </div>

        {/* 进度条 */}
        <div className="flex items-center justify-center gap-4 mb-8">
          {[1, 2, 3].map(s => (
            <div key={s} className="flex items-center gap-2">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                step >= s ? 'bg-blue-500 text-white' : 'bg-white/10 text-gray-400'
              }`}>
                {s}
              </div>
              <span className={`text-sm ${step >= s ? 'text-white' : 'text-gray-500'}`}>
                {s === 1 ? '企业信息' : s === 2 ? '联系方式' : '账户设置'}
              </span>
              {s < 3 && <div className={`w-12 h-0.5 ${step > s ? 'bg-blue-500' : 'bg-white/10'}`} />}
            </div>
          ))}
        </div>

        {/* 表单 */}
        <form onSubmit={handleSubmit} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8">
          {step === 1 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-4">企业基本信息</h2>
              <div>
                <label className="block text-sm text-gray-300 mb-1">国家/地区 *</label>
                <select
                  value={form.country}
                  onChange={e => updateField('country', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 [&>option]:bg-slate-800 [&>option]:text-white"
                >
                  <option value="CN">中国</option>
                  <option value="US">美国</option>
                  <option value="HK">中国香港</option>
                  <option value="SG">新加坡</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">企业全称 *</label>
                <input
                  type="text"
                  value={form.companyName}
                  onChange={e => updateField('companyName', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="如：杭州奕溪贸易有限公司"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">统一社会信用代码 *</label>
                <input
                  type="text"
                  value={form.registrationNo}
                  onChange={e => updateField('registrationNo', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="18位统一社会信用代码"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">法定代表人 *</label>
                <input
                  type="text"
                  value={form.legalPerson}
                  onChange={e => updateField('legalPerson', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="法人姓名"
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">经营类别 *</label>
                <select
                  value={form.businessCategory}
                  onChange={e => updateField('businessCategory', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-blue-500 [&>option]:bg-slate-800 [&>option]:text-white"
                  required
                >
                  <option value="">请选择</option>
                  {BUSINESS_CATEGORIES.map(c => (
                    <option key={c.value} value={c.value}>{c.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">注册地址 *</label>
                <input
                  type="text"
                  value={form.registeredAddress}
                  onChange={e => updateField('registeredAddress', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="企业注册地址"
                  required
                />
              </div>
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-full bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition mt-4"
              >
                下一步
              </button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-4">联系方式</h2>
              <div>
                <label className="block text-sm text-gray-300 mb-1">企业邮箱 *</label>
                <input
                  type="email"
                  value={form.email}
                  onChange={e => updateField('email', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="用于登录和接收通知"
                  required
                />
              </div>
              <div className="flex gap-3">
                <div className="w-28">
                  <label className="block text-sm text-gray-300 mb-1">区号</label>
                  <select
                    value={form.phoneCode}
                    onChange={e => updateField('phoneCode', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-3 py-3 text-white focus:outline-none focus:border-blue-500 [&>option]:bg-slate-800 [&>option]:text-white"
                  >
                    <option value="+86">+86</option>
                    <option value="+1">+1</option>
                    <option value="+852">+852</option>
                  </select>
                </div>
                <div className="flex-1">
                  <label className="block text-sm text-gray-300 mb-1">联系电话 *</label>
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={e => updateField('phone', e.target.value)}
                    className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                    placeholder="手机号"
                    required
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">经营地址</label>
                <input
                  type="text"
                  value={form.businessAddress}
                  onChange={e => updateField('businessAddress', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="如与注册地址不同请填写"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">企业网站</label>
                <input
                  type="url"
                  value={form.website}
                  onChange={e => updateField('website', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="https://"
                />
              </div>
              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setStep(1)} className="flex-1 border border-white/20 text-white py-3 rounded-lg font-medium hover:bg-white/5 transition">
                  上一步
                </button>
                <button type="button" onClick={() => setStep(3)} className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-lg font-medium transition">
                  下一步
                </button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <h2 className="text-white font-semibold text-lg mb-4">账户设置</h2>
              <div>
                <label className="block text-sm text-gray-300 mb-1">登录密码 *</label>
                <input
                  type="password"
                  value={form.password}
                  onChange={e => updateField('password', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="至少8位，包含字母和数字"
                  minLength={8}
                  required
                />
              </div>
              <div>
                <label className="block text-sm text-gray-300 mb-1">确认密码 *</label>
                <input
                  type="password"
                  value={form.confirmPassword}
                  onChange={e => updateField('confirmPassword', e.target.value)}
                  className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-white placeholder-gray-500 focus:outline-none focus:border-blue-500"
                  placeholder="再次输入密码"
                  required
                />
              </div>
              <div className="flex items-start gap-2 mt-4">
                <input
                  type="checkbox"
                  checked={form.agreementAccepted}
                  onChange={e => updateField('agreementAccepted', e.target.checked)}
                  className="mt-1"
                  required
                />
                <span className="text-gray-300 text-sm">
                  我已阅读并同意{' '}
                  <a href="/merchant-agreement" className="text-blue-400 hover:underline">商户服务协议</a>
                  {' '}和{' '}
                  <a href="/privacy" className="text-blue-400 hover:underline">隐私政策</a>
                </span>
              </div>

              {error && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-400 text-sm">
                  {error}
                </div>
              )}

              <div className="flex gap-3 mt-4">
                <button type="button" onClick={() => setStep(2)} className="flex-1 border border-white/20 text-white py-3 rounded-lg font-medium hover:bg-white/5 transition">
                  上一步
                </button>
                <button type="submit" disabled={loading} className="flex-1 bg-blue-500 hover:bg-blue-600 disabled:opacity-50 text-white py-3 rounded-lg font-medium transition">
                  {loading ? '提交中...' : '提交注册'}
                </button>
              </div>
            </div>
          )}
        </form>

        <p className="text-gray-500 text-xs text-center mt-6">
          注册后自动提交审核，平台管理员审核通过后即可使用收款功能
        </p>
      </div>
    </div>
  );
}
