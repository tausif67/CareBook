import { useEffect, useMemo, useState } from 'react';
import { Activity, CalendarDays, IndianRupee, LogOut, ShieldCheck, Stethoscope, Users } from 'lucide-react';
import { Analytics, ApiClient, Appointment, Doctor, Patient, Payment } from './api';
import { Login } from './Login';

type Page = 'dashboard' | 'doctors' | 'patients' | 'appointments' | 'payments';
const money = (paise: number) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(paise / 100);

export default function App() {
  const [token, setToken] = useState(() => localStorage.getItem('carebook-admin-token') ?? '');
  const [page, setPage] = useState<Page>('dashboard');
  const api = useMemo(() => new ApiClient(token), [token]);
  if (!token) return <Login onLogin={setToken} />;
  const logout = () => { localStorage.removeItem('carebook-admin-token'); setToken(''); };
  return <div className="app-shell">
    <aside><div className="brand"><span>+</span><div><strong>CareBook</strong><small>ADMIN CONSOLE</small></div></div>
      <nav>{(['dashboard','doctors','patients','appointments','payments'] as Page[]).map((item) =>
        <button key={item} className={page === item ? 'active' : ''} onClick={() => setPage(item)}>{item}</button>)}</nav>
      <button className="logout" onClick={logout}><LogOut size={17} /> Sign out</button>
    </aside>
    <main className="content"><header><div><small>CAREBOOK OPERATIONS</small><h1>{page[0].toUpperCase() + page.slice(1)}</h1></div><div className="admin-chip"><ShieldCheck size={18}/> Verified admin</div></header>
      {page === 'dashboard' && <Dashboard api={api} />}
      {page === 'doctors' && <Doctors api={api} />}
      {page === 'patients' && <TablePage load={api.patients.bind(api)} columns={['Patient','Mobile','Status','Joined']} render={(x: Patient) => [x.user.displayName,x.user.phoneE164,x.user.status,new Date(x.createdAt).toLocaleDateString('en-IN')]} />}
      {page === 'appointments' && <TablePage load={api.appointments.bind(api)} columns={['ID','Patient','Doctor','When','Status','Value']} render={(x: Appointment) => [x.publicId,x.patient.user.displayName,x.doctor.user.displayName,new Date(x.startAt).toLocaleString('en-IN'),x.status,money(x.totalPaise)]} />}
      {page === 'payments' && <TablePage load={api.payments.bind(api)} columns={['Gateway order','Status','Amount','Created']} render={(x: Payment) => [x.gatewayOrderId,x.status,money(x.amountPaise),new Date(x.createdAt).toLocaleString('en-IN')]} />}
    </main>
  </div>;
}

function Dashboard({ api }: { api: ApiClient }) {
  const [data, setData] = useState<Analytics>();
  useEffect(() => { void api.analytics().then(setData); }, [api]);
  if (!data) return <div className="loading">Loading dashboard…</div>;
  const cards = [
    ['Patients', data.totalPatients, Users], ['Doctors', data.totalDoctors, Stethoscope],
    ['Pending verification', data.pendingVerification, ShieldCheck], ["Today's appointments", data.todayAppointments, CalendarDays],
    ['Monthly appointments', data.monthlyAppointments, Activity], ['Gross booking value', money(data.grossBookingValuePaise), IndianRupee],
  ] as const;
  return <><section className="cards">{cards.map(([label,value,Icon]) => <article key={label}><div className="icon"><Icon size={20}/></div><small>{label}</small><strong>{value}</strong></article>)}</section>
    <section className="panel"><div><small>PLATFORM REVENUE — THIS MONTH</small><h2>{money(data.platformRevenuePaise)}</h2></div><div><small>VERIFIED DOCTORS</small><h2>{data.verifiedDoctors}</h2></div></section></>;
}

function Doctors({ api }: { api: ApiClient }) {
  const [items, setItems] = useState<Doctor[]>([]); const [message, setMessage] = useState('');
  const refresh = () => void api.doctors().then(setItems); useEffect(refresh, [api]);
  const decide = async (id: string, status: string) => { await api.reviewDoctor(id, status); setMessage(`Doctor moved to ${status}`); refresh(); };
  const reviewDocument = async (id: string, status: 'APPROVED' | 'REJECTED') => { await api.reviewDocument(id, status); setMessage(`Document ${status.toLowerCase()}`); refresh(); };
  const openDocument = async (id: string) => { const item = await api.documentDownload(id); window.open(item.downloadUrl, '_blank', 'noopener,noreferrer'); };
  return <section className="table-card"><div className="table-title"><div><h2>Pending verification</h2><p>Approval stays blocked until each submitted document is reviewed.</p></div><span>{items.length} waiting</span></div>{message && <div className="success">{message}</div>}
    {items.length === 0 ? <div className="empty">No doctors are waiting for verification.</div> : <table><thead><tr><th>Doctor</th><th>Specialty</th><th>Experience</th><th>Documents</th><th>Action</th></tr></thead><tbody>{items.map((doctor) => <tr key={doctor.id}><td><strong>{doctor.user.displayName}</strong><small>{doctor.user.phoneE164}</small></td><td>{doctor.specializations.map((x) => x.specialization.nameEn).join(', ')}</td><td>{doctor.experienceYears} years</td><td>{doctor.documents.map((document) => <div className="doc-row" key={document.id}><button className="link-button" disabled={!document.uploadedAt} onClick={() => void openDocument(document.id)}>{document.fileName ?? document.type}</button><span>{document.status}</span>{document.status === 'PENDING' && document.uploadedAt && <div className="actions"><button onClick={() => void reviewDocument(document.id,'APPROVED')}>✓</button><button className="secondary" onClick={() => void reviewDocument(document.id,'REJECTED')}>×</button></div>}</div>)}</td><td><div className="actions"><button disabled={doctor.documents.length === 0 || doctor.documents.some((document) => document.status !== 'APPROVED')} onClick={() => void decide(doctor.id,'APPROVED')}>Approve</button><button className="secondary" onClick={() => void decide(doctor.id,'CORRECTION_REQUIRED')}>Corrections</button></div></td></tr>)}</tbody></table>}
  </section>;
}

function TablePage<T>({ load, columns, render }: { load: () => Promise<T[]>; columns: string[]; render: (item: T) => Array<string | number> }) {
  const [items, setItems] = useState<T[]>([]); useEffect(() => { void load().then(setItems); }, [load]);
  return <section className="table-card"><div className="table-title"><h2>Records</h2><span>{items.length} shown</span></div>{items.length === 0 ? <div className="empty">No records found.</div> : <table><thead><tr>{columns.map((x) => <th key={x}>{x}</th>)}</tr></thead><tbody>{items.map((item, index) => <tr key={index}>{render(item).map((value, cell) => <td key={cell}>{value}</td>)}</tr>)}</tbody></table>}</section>;
}
