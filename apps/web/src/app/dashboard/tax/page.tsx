import type { Metadata } from 'next';
import { TaxWorkspace } from '@/components/tax/TaxWorkspace';

export const metadata: Metadata = { title: 'Tax preparation', robots: { index: false, follow: false } };

export default function TaxPage() { return <TaxWorkspace />; }
