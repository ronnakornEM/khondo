import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CalendarDays, FileText, Globe, Inbox, Smartphone, Users } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { PlanCards } from '@/components/PlanCards';
import { btnClass } from '@/components/ui';
import { useAuth } from '@/lib/auth';

const FEATURES = [
  { icon: Building2, title: 'One portfolio for everything', text: 'Condos, houses, townhouses and land — with photos, prices in ฿, ตร.ว., amenities and status, all in one tidy list.' },
  { icon: Globe, title: 'A landing page that’s yours', text: 'Every agent gets a beautiful, mobile-first page at khondo.app/a/your-name. Pick a theme and colour, share it on LINE and Facebook.' },
  { icon: Inbox, title: 'Inquiries in your pocket', text: 'Visitors message you straight from a listing. Call, LINE or email them back in one tap.' },
  { icon: Users, title: 'Contacts & pipeline', text: 'Buyers, sellers, tenants and landlords with stages, tags and notes. Never lose a lead again.', premium: true },
  { icon: FileText, title: 'Bills & invoices', text: 'Rent, deposits and commissions — create, send, print as PDF and see what’s paid or overdue.', premium: true },
  { icon: CalendarDays, title: 'Advanced calendar', text: 'Month, week and day views, recurring viewings, reminders, bill due dates and sync to Google / Apple Calendar.', premium: true },
];

export function Home() {
  const { token } = useAuth();
  return (
    <div className="min-h-dvh overflow-x-clip bg-sand">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-4 py-4 sm:px-6">
        <Logo />
        <div className="flex items-center gap-2">
          {token ? <Link to="/app" className={btnClass('primary', 'sm')}>Open app</Link> : (<><Link to="/login" className={btnClass('ghost', 'sm')}>Sign in</Link><Link to="/register" className={btnClass('primary', 'sm')}>Start free</Link></>)}
        </div>
      </header>

      <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-8 sm:px-6 lg:grid-cols-2 lg:pt-16">
        <div>
          <span className="inline-block rounded-full bg-brand-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-brand-800">Made for Khon Kaen agents</span>
          <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-6xl">Every listing you hold. <span className="text-brand-700">One link.</span></h1>
          <p className="mt-5 max-w-xl text-lg text-stone-600">Khondo is the portfolio, landing page and back-office for real estate agents. Show off your properties, catch every inquiry, and — with Premium — run your clients, bills and calendar in the same place.</p>
          <div className="mt-7 flex flex-wrap gap-3">
            <Link to="/register" className={btnClass('primary', 'md', 'px-6 py-3 text-base')}>Create your free page <ArrowRight className="size-5" /></Link>
            <a href="#pricing" className={btnClass('secondary', 'md', 'px-6 py-3 text-base')}>See pricing</a>
          </div>
          <p className="mt-3 text-sm text-stone-500">Free forever for up to 5 properties. No card needed.</p>
        </div>
        <HeroMock />
      </section>

      <section className="border-y border-stone-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <h2 className="text-center text-3xl font-extrabold tracking-tight">Everything an agent needs</h2>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div key={f.title} className="rounded-2xl border border-stone-200 bg-stone-50/60 p-5">
                <div className="mb-3 flex size-11 items-center justify-center rounded-xl bg-brand-100 text-brand-800"><f.icon className="size-5" /></div>
                <h3 className="font-bold">{f.title} {f.premium && <span className="ml-1 rounded-full bg-amber-100 px-2 py-0.5 align-middle text-[10px] font-bold uppercase text-amber-800">Premium</span>}</h3>
                <p className="mt-1.5 text-sm text-stone-600">{f.text}</p>
              </div>
            ))}
          </div>
          <div className="mx-auto mt-10 flex max-w-xl items-center justify-center gap-3 rounded-2xl bg-brand-50 p-4 text-sm text-brand-900"><Smartphone className="size-6 shrink-0" /> Works beautifully on your phone — install it to your home screen today, native app stores next.</div>
        </div>
      </section>

      <section id="pricing" className="mx-auto max-w-4xl px-4 py-16 sm:px-6">
        <h2 className="text-center text-3xl font-extrabold tracking-tight">Start free. Grow when you’re ready.</h2>
        <div className="mt-10"><PlanCards action={<Link to="/register" className={btnClass('premium', 'md', 'w-full')}>Start free, upgrade any time</Link>} /></div>
      </section>

      <footer className="border-t border-stone-200 py-8 text-center text-sm text-stone-500">
        <Logo className="mb-2 justify-center" />
        <p>Khondo = <b>Khon</b> Kaen + con<b>do</b>. Built with ♥ in Isan.</p>
      </footer>
    </div>
  );
}

function HeroMock() {
  const items = [
    { t: 'Lake-view 1BR, Bueng Kaen Nakhon', p: '฿1.89M', tag: 'For sale', c: 'bg-emerald-500' },
    { t: 'Modern studio near KKU', p: '฿7,500/mo', tag: 'For rent', c: 'bg-sky-600' },
    { t: 'Townhome, Mueang Khon Kaen', p: '฿3.2M', tag: 'Reserved', c: 'bg-amber-400' },
  ];
  return (
    <div className="relative mx-auto w-full max-w-sm">
      <div className="absolute -inset-6 -z-10 rounded-[3rem] bg-gradient-to-br from-brand-200 to-amber-100 blur-2xl" />
      <div className="overflow-hidden rounded-[2rem] border-4 border-stone-800 bg-white shadow-2xl">
        <div className="bg-gradient-to-br from-brand-700 to-brand-600 p-5 text-white">
          <div className="flex items-center gap-3"><div className="grid size-14 place-items-center rounded-full bg-white/90 text-xl font-extrabold text-brand-700">N</div><div><div className="font-extrabold">Nok Property</div><div className="text-xs opacity-80">Condo specialist · Khon Kaen</div></div></div>
          <div className="mt-4 flex gap-2 text-xs font-bold"><span className="rounded-full bg-white px-3 py-1.5 text-stone-900">📞 Call</span><span className="rounded-full bg-[#06C755] px-3 py-1.5">LINE</span></div>
        </div>
        <div className="space-y-3 bg-stone-50 p-4">
          {items.map((i, n) => (
            <div key={i.t} className="flex gap-3 rounded-2xl border border-stone-200 bg-white p-2.5">
              <div className={`size-16 shrink-0 rounded-xl ${['bg-gradient-to-br from-sky-200 to-brand-200', 'bg-gradient-to-br from-amber-100 to-orange-200', 'bg-gradient-to-br from-emerald-100 to-lime-200'][n]}`} />
              <div className="min-w-0"><span className={`rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${i.c}`}>{i.tag}</span><div className="mt-1 truncate text-sm font-semibold">{i.t}</div><div className="font-extrabold text-brand-800">{i.p}</div></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
