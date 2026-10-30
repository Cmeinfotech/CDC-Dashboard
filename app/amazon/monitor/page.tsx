import { redirect } from 'next/navigation';

export default function AmazonMonitorRedirect() {
  redirect('/?page=tracking');
}
