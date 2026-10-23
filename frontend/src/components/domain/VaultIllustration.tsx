import { cn } from '@/lib/cn';

export function VaultIllustration({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 460 310" fill="none" className={cn('w-full', className)} aria-hidden>
      <circle cx="239" cy="155" r="138" stroke="#c1e7ca" strokeOpacity=".12" />
      <circle cx="239" cy="155" r="106" stroke="#c1e7ca" strokeOpacity=".12" strokeDasharray="4 8" />
      <path d="M45 174h50m280-78h48M142 38v22m217 175v28" stroke="#dcf98b" strokeOpacity=".35" />
      <circle cx="97" cy="175" r="4" fill="#dcf98b" />
      <circle cx="378" cy="96" r="4" fill="#dcf98b" />
      <g transform="rotate(-12 217 159)">
        <rect x="119" y="47" width="189" height="230" rx="19" fill="#c7dfcd" fillOpacity=".13" stroke="#e8f6ea" strokeOpacity=".3" />
      </g>
      <g transform="rotate(7 240 164)">
        <rect x="147" y="39" width="188" height="234" rx="19" fill="#f1f6ec" />
        <rect x="168" y="61" width="38" height="42" rx="10" fill="#e0eadc" />
        <path d="M182 74h12m-12 6h12m-12 6h7" stroke="#4b725e" strokeWidth="2" strokeLinecap="round" />
        <rect x="168" y="120" width="116" height="8" rx="4" fill="#244b3d" />
        <rect x="168" y="140" width="145" height="5" rx="2.5" fill="#cbd9c7" />
        <rect x="168" y="152" width="121" height="5" rx="2.5" fill="#cbd9c7" />
        <rect x="168" y="179" width="145" height="1" fill="#dbe5d6" />
        <circle cx="179" cy="201" r="11" fill="#d4e2cb" />
        <circle cx="179" cy="198" r="3" fill="#76946c" />
        <path d="M173 206c0-6 12-6 12 0" fill="#76946c" />
        <rect x="198" y="196" width="75" height="5" rx="2.5" fill="#8fa587" />
        <rect x="198" y="208" width="50" height="4" rx="2" fill="#cbd9c7" />
        <rect x="168" y="237" width="74" height="7" rx="3.5" fill="#d8e6d0" />
      </g>
      <rect x="282" y="171" width="100" height="107" rx="25" fill="#dcf98b" stroke="#f0ffc6" strokeWidth="2" />
      <path d="M332 191l28 10v20c0 18-12 31-28 38-16-7-28-20-28-38v-20l28-10z" stroke="#173d32" strokeWidth="3" strokeLinejoin="round" />
      <path d="M320 223l8 8 17-19" stroke="#173d32" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
      <rect x="59" y="103" width="123" height="43" rx="13" fill="#275344" stroke="#557c61" />
      <circle cx="81" cy="124" r="10" fill="#dcf98b" />
      <path d="M77 124l3 3 5-6" stroke="#173d32" strokeWidth="1.8" strokeLinecap="round" />
      <path d="M101 120h59m-59 8h37" stroke="#c9dfc0" strokeWidth="4" strokeLinecap="round" />
      <circle cx="337" cy="36" r="5" fill="#dcf98b" fillOpacity=".5" />
      <circle cx="119" cy="256" r="3" fill="#dcf98b" fillOpacity=".6" />
    </svg>
  );
}
