import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, Inbox, Mail, Phone, Trash2, UserPlus } from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import type { Inquiry } from '@shared/types';
import { del, get, patch, post } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dateLabel, whatsappLikeTel } from '@/lib/format';
import { Badge, Button, Card, EmptyState, ErrorNote, PageHeader, PageLoader, PremiumBadge } from '@/components/ui';
import { useT } from '@/lib/i18n';

export function InquiriesPage() {
  const t = useT();
  const qc = useQueryClient();
  const nav = useNavigate();
  const { isPremium } = useAuth();
  const q = useQuery({ queryKey: ['inquiries'], queryFn: () => get<Inquiry[]>('/inquiries') });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['inquiries'] });
    qc.invalidateQueries({ queryKey: ['dashboard'] });
  };
  const toggle = useMutation({ mutationFn: (i: Inquiry) => patch(`/inquiries/${i.id}`, { handled: !i.handled }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (i: Inquiry) => del(`/inquiries/${i.id}`), onSuccess: refresh });
  const convert = useMutation({
    mutationFn: (i: Inquiry) => post<{ contactId: string }>(`/inquiries/${i.id}/convert`),
    onSuccess: () => {
      refresh();
      qc.invalidateQueries({ queryKey: ['contacts'] });
      nav('/app/contacts');
    },
  });

  return (
    <>
      <PageHeader title={t('Inquiries')} subtitle={t('Messages from visitors of your landing page.')} />
      {q.isLoading ? (
        <PageLoader />
      ) : q.error ? (
        <ErrorNote error={q.error} />
      ) : !q.data?.length ? (
        <EmptyState icon={<Inbox className="size-6" />} title={t('No inquiries yet')} text={t('When someone fills in the contact form on your page, it lands here.')} />
      ) : (
        <div className="space-y-3">
          <ErrorNote error={convert.error} />
          {q.data.map((i) => (
            <Card key={i.id} className={i.handled ? 'opacity-70' : 'border-l-4 border-l-brand-600'}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <div className="font-bold">{i.name} {!i.handled && <Badge tone="teal">{t('New')}</Badge>}</div>
                  <div className="text-xs text-stone-500">{dateLabel(i.createdAt, 'd MMM yyyy, HH:mm')}{i.propertyTitle ? ` · about “${i.propertyTitle}”` : ''}</div>
                </div>
                <div className="flex gap-1.5">
                  {i.phone && <a href={`tel:${whatsappLikeTel(i.phone)}`} className="rounded-full bg-brand-50 p-2 text-brand-800" aria-label={t('Call')}><Phone className="size-4" /></a>}
                  {i.email && <a href={`mailto:${i.email}`} className="rounded-full bg-brand-50 p-2 text-brand-800" aria-label={t('Email')}><Mail className="size-4" /></a>}
                </div>
              </div>
              {i.message && <p className="mt-2 whitespace-pre-line text-sm text-stone-700">{i.message}</p>}
              <div className="mt-2 text-xs text-stone-500">{[i.phone, i.email].filter(Boolean).join(' · ')}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => toggle.mutate(i)}>
                  <Check className="size-4" /> {i.handled ? t('Mark as new') : t('Mark handled')}
                </Button>
                {isPremium ? (
                  <Button size="sm" variant="secondary" loading={convert.isPending && convert.variables?.id === i.id} onClick={() => convert.mutate(i)}>
                    <UserPlus className="size-4" /> {t('Add to contacts')}</Button>
                ) : (
                  <Link to="/app/billing" className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-amber-300 px-3 py-1.5 text-sm font-semibold text-amber-800">
                    <UserPlus className="size-4" /> {t('Add to contacts')} <PremiumBadge />
                  </Link>
                )}
                <Button size="sm" variant="ghost" onClick={() => confirm(t('Delete this inquiry?')) && remove.mutate(i)}>
                  <Trash2 className="size-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
