import type { Metadata } from 'next';
import MusicLab from '../../components/MusicLab';

export const metadata: Metadata = { title: 'CYBERKNIGHT · Music Lab' };

export default function Page() {
  return <MusicLab />;
}
