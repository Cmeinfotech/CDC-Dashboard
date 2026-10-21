import AmazonAccountHealth from '../../../components/AmazonAccountHealth';
export default function AccountHealthPage() {
  return <main style={{ margin: 0, padding: '32px clamp(16px, 4vw, 64px)', minHeight: '100vh', background: '#f5f7fb' }}>
    <a href="/amazon">← Amazon Live Data</a>
    <h1 style={{ margin: '24px 0' }}>Amazon Account Health</h1>
    <AmazonAccountHealth />
  </main>;
}
