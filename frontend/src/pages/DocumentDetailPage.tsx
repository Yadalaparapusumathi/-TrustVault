import { useParams } from 'react-router-dom';
import { DocumentDetailView } from '@/features/documents/DocumentDetail';

export default function DocumentDetailPage() {
  const { id = '' } = useParams();
  // Re-mount per document so local UI state never leaks between documents.
  return <DocumentDetailView key={id} id={id} />;
}
