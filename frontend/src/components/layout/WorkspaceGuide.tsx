import { FileCheck2, Fingerprint, History, KeyRound, Share2, Upload, Users } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useMe } from '@/auth/AuthContext';
import { Dialog } from '@/components/ui/Dialog';

export function WorkspaceGuide({ open, onClose }: { open: boolean; onClose: () => void }) {
  const me = useMe();
  const steps = me.role === 'ADMIN'
    ? [
        { icon: Users, title: 'Manage people, not their files', text: 'Create accounts, set roles, reset passwords, terminate sessions and transfer a departing owner\'s documents.', to: '/admin/users', label: 'People & roles' },
        { icon: History, title: 'Follow the evidence', text: 'Filter the audit trail by person, action, result, document or date. Open an event for its request details, or export the filtered CSV.', to: '/admin/audit', label: 'Audit trail' },
        { icon: Fingerprint, title: 'Inspect activity and integrity', text: 'Review denied attempts and permission changes. Re-verify the HMAC chain from the overview. Admin status never grants document access.', to: '/admin', label: 'Security overview' },
      ]
    : [
        ...(me.role === 'OWNER' ? [{ icon: Upload, title: 'Upload and organise', text: 'Add a file with a category and classification. The server validates its content, encrypts it and records the upload. It starts private.', to: '/documents?scope=owned', label: 'My documents' }] : []),
        { icon: FileCheck2, title: 'Find and work with documents', text: 'Search by name, owner, category or creation date. Open a document for its details and version history. EDIT also permits changes and new versions.', to: '/documents', label: 'Document library' },
        ...(me.role === 'OWNER' ? [{ icon: Share2, title: 'Share with a named person', text: 'Open a document you own, then Access. Choose Read or Edit and an optional expiry. Edit or revoke a grant there; revocation applies on the next request.', to: '/documents?scope=owned', label: 'Manage owned documents' }] : []),
        { icon: History, title: me.role === 'OWNER' ? 'Check the history' : 'Understand your access', text: me.role === 'OWNER' ? 'The Activity tab on each owned document records access and refused attempts. Trash removes access immediately; restore or permanently delete from Trash & recovery.' : 'Only explicitly shared documents are visible. READ permits details and downloads; EDIT adds metadata and version updates. Ask the owner to change access.', to: me.role === 'OWNER' ? '/documents?scope=trash' : '/documents?scope=shared', label: me.role === 'OWNER' ? 'Trash & recovery' : 'Shared with me' },
      ];
  return (
    <Dialog open={open} onClose={onClose} size="lg" title="Make yourself at home" description={`Your ${me.role.toLowerCase()} workspace, explained. Every action still goes through server-side authorisation.`}>
      <div className="space-y-3 pb-3">
        {steps.map((step, i) => (
          <div key={step.title} className="flex gap-4 rounded-2xl border border-slate-100 bg-canvas/60 p-4">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-brand-700 shadow-soft"><step.icon className="h-5 w-5" /></span>
            <div>
              <p className="eyebrow mb-1 text-brand-600">Step {i + 1}</p>
              <h3 className="text-sm font-semibold">{step.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{step.text}</p>
              <Link to={step.to} onClick={onClose} className="mt-2 inline-block rounded text-sm font-medium text-brand-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500">{step.label} &rarr;</Link>
            </div>
          </div>
        ))}
        <p className="flex items-start gap-2 px-1 pt-2 text-xs leading-relaxed text-slate-500"><KeyRound className="mt-0.5 h-4 w-4 shrink-0" />There are no public links or inherited folder permissions. Files are downloaded, not rendered inside the application.</p>
      </div>
    </Dialog>
  );
}
