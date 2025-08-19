import { useEffect, useMemo, useRef, useState } from 'react';
import axios from 'axios';
import dayjs from 'dayjs';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';

type Message = { kind: 'success' | 'error' | 'info'; text: string } | null;

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  body: z.string().min(1, 'Body is required'),
  releaseAt: z.string().min(1, 'Release time is required'),
  webhookUrl: z.string().url('Must be a valid URL'),
  adminToken: z.string().min(1, 'Admin token is required')
});

type FormData = z.infer<typeof schema>;

type NoteRow = {
  id: string;
  title: string;
  status: 'pending' | 'delivered' | 'failed' | 'dead';
  lastAttemptCode: number | null;
};

const Banner = ({ kind = 'info', children }: { kind?: 'info'|'success'|'error'|'warning'; children: React.ReactNode }) => {
  const map: Record<string, string> = {
    info: 'banner banner--info',
    success: 'banner banner--success',
    error: 'banner banner--error',
    warning: 'banner banner--warning',
  };
  return <div className={map[kind]}>{children}</div>;
};

const Field = ({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) => (
  <label className="field">
    <span className="field__label">{label}</span>
    {children}
    {error && <small className="field__error">{error}</small>}
  </label>
);

export const App = () => {
  const [notes, setNotes] = useState<NoteRow[]>([]);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [lastDeliveredId, setLastDeliveredId] = useState<string | null>(null);
  const [message, setMessage] = useState<Message>(null);

  const {
    register,
    handleSubmit,
    reset,
    getValues,
    formState: { errors, isSubmitting }
  } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      title: '',
      body: '',
      releaseAt: dayjs().toISOString(),
      webhookUrl: (import.meta as any).env?.VITE_DEFAULT_SINK_URL || 'http://sink:4000/sink',
      adminToken: 'changeme'
    }
  });

  const headers = useMemo(() => (token: string) => ({ Authorization: `Bearer ${token}` }), []);

  const fetchNotes = async (token: string, status: string, p: number) => {
    const params: any = { page: p };
    if (status) params.status = status;
    const res = await axios.get('/api/notes', { params, headers: headers(token) });
    const items: NoteRow[] = res.data.items || [];
    setNotes(items);
    return items;
  };

  const onSubmit = async (data: FormData) => {
    setMessage(null);
    try {
      await axios.post(
        '/api/notes',
        { title: data.title, body: data.body, releaseAt: data.releaseAt, webhookUrl: data.webhookUrl },
        { headers: headers(data.adminToken) }
      );
      reset({ ...data, title: '', body: '' });
      await fetchNotes(data.adminToken, statusFilter, page);
      setMessage({ kind: 'success', text: 'Note created and enqueued (if due).' });
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to create note';
      setMessage({ kind: 'error', text: msg });
    }
  };

  const handleReplay = async (id: string, token: string) => {
    try {
      await axios.post(`/api/notes/${id}/replay`, undefined, { headers: headers(token) });
      await fetchNotes(token, statusFilter, page);
      setMessage({ kind: 'success', text: 'Note replayed.' });
    } catch {
      setMessage({ kind: 'error', text: 'Failed to replay note' });
    }
  };

  useEffect(() => {
    const token = getValues('adminToken') || 'changeme';
    let isMounted = true;
    const deliveredIdsRef = { current: new Set<string>() };

    const run = async () => {
      try {
        const items = await fetchNotes(token, statusFilter, page);
        if (!isMounted) return;
        const nowDelivered = items.find((n) => n.status === 'delivered' && !deliveredIdsRef.current.has(n.id));
        if (nowDelivered) setLastDeliveredId(nowDelivered.id);
        deliveredIdsRef.current = new Set(items.filter((n) => n.status === 'delivered').map((n) => n.id));
      } catch (e: any) {
        if (e?.response?.status === 429) {
          setMessage({ kind: 'error', text: 'Rate limit reached. Slowing down updates.' });
        }
      }
    };

    // Initial fetch
    run();

    // Poll gently (every 5s) to avoid rate limiting
    const interval = setInterval(run, 5000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [page, statusFilter]);

  return (
    <div className="container">
      <header className="header">
        <h1 className="title">DropLater Admin</h1>
        <p className="subtitle">Create, list, and replay scheduled notes</p>
      </header>

      {message && (
        <div className="section">
          <Banner kind={message.kind}>{message.text}</Banner>
        </div>
      )}

      <section className="section">
        <div className="card">
          <h2 className="card__title">Create Note</h2>
          <form onSubmit={handleSubmit(onSubmit)} className="grid">
            <Field label="Title" error={errors.title?.message}>
              <input className="input" {...register('title')} placeholder="Welcome" />
            </Field>
            <Field label="Body" error={errors.body?.message}>
              <input className="input" {...register('body')} placeholder="Hello from DropLater" />
            </Field>
            <Field label="releaseAt (ISO)" error={errors.releaseAt?.message}>
              <input className="input" {...register('releaseAt')} />
            </Field>
            <Field label="webhookUrl" error={errors.webhookUrl?.message}>
              <input className="input" {...register('webhookUrl')} />
            </Field>
            <Field label="Admin token" error={errors.adminToken?.message}>
              <input className="input" {...register('adminToken')} />
            </Field>
            <div className="actions">
              <button className="btn btn--primary" disabled={isSubmitting} type="submit">Create</button>
            </div>
          </form>
        </div>
      </section>

      <section className="section">
        <div className="row">
          <select className="select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All</option>
            <option value="pending">Pending</option>
            <option value="delivered">Delivered</option>
            <option value="failed">Failed</option>
            <option value="dead">Dead</option>
          </select>
          <div className="row__spacer" />
          <button className="btn btn--outline" onClick={() => setPage((p) => Math.max(1, p - 1))}>Prev</button>
          <span className="page">Page {page}</span>
          <button className="btn btn--outline" onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
        <div className="card">
          <table className="table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Status</th>
                <th>Last Code</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {notes.map((n) => (
                <tr key={n.id} className={lastDeliveredId === n.id ? 'pulse' : ''}>
                  <td className="mono">{n.id}</td>
                  <td>{n.title}</td>
                  <td>{n.status}</td>
                  <td>{n.lastAttemptCode ?? ''}</td>
                  <td style={{display:'flex', gap:8}}>
                    <button
                      className="btn btn--sm btn--outline"
                      disabled={!(n.status === 'failed' || n.status === 'dead')}
                      title={n.status === 'failed' || n.status === 'dead' ? 'Replay delivery' : 'Only failed or dead notes can be replayed'}
                      onClick={() => handleReplay(n.id, getValues('adminToken') || 'changeme')}
                    >
                      Replay
                    </button>
                    <button className="btn btn--sm btn--outline" onClick={async () => {
                      try {
                        const token = getValues('adminToken') || 'changeme';
                        await axios.delete(`/api/notes/${n.id}`, { headers: headers(token) });
                        await fetchNotes(token, statusFilter, page);
                        setMessage({ kind: 'success', text: 'Note deleted.' });
                      } catch (e: any) {
                        const detail = e?.response?.data?.error || e?.message || 'Failed to delete note';
                        setMessage({ kind: 'error', text: detail });
                      }
                    }}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};


