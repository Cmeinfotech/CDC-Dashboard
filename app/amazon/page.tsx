import { redirect } from 'next/navigation';

export default function AmazonLiveDataRedirect() {
  redirect('/?page=tracking');
}
