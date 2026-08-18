import Link from 'next/link';

export default async function PreviewPayPage({
  params,
}: {
  params: Promise<{ orderNo: string }>;
}) {
  const { orderNo } = await params;
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-white rounded-xl border border-gray-200 p-8 text-center">
        <div className="w-10 h-10 mx-auto bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg flex items-center justify-center">
          <span className="text-white font-bold">B</span>
        </div>
        <h1 className="mt-4 text-lg font-bold text-gray-900">BunnyEra Pay 演示预览</h1>
        <p className="mt-3 text-sm text-gray-600">
          订单 <span className="font-medium text-gray-900">{orderNo}</span> 为演示预览订单，
          支付渠道尚未配置或未审核通过，不会产生真实资金。
        </p>
        <p className="mt-2 text-xs text-gray-400">
          配置正式支付宝商户参数并设置 PAYMENT_ENV=PRODUCTION 后，此处将替换为真实支付宝收款码。
        </p>
        <Link href="/dashboard" className="mt-6 inline-block text-sm text-blue-600 hover:underline">
          返回 BunnyEra Pay
        </Link>
      </div>
    </div>
  );
}
