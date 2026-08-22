const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:4000/api/v1';

export class ApiClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}`, ...init?.headers },
    });
    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: { message: 'Request failed' } })) as { error?: { message?: string } };
      throw new Error(error.error?.message ?? `Request failed (${response.status})`);
    }
    return response.json() as Promise<T>;
  }

  analytics() { return this.request<Analytics>('/admin/analytics'); }
  doctors(status = 'PENDING_VERIFICATION') { return this.request<Doctor[]>(`/admin/doctors?status=${status}`); }
  reviewDoctor(id: string, status: string, notes?: string) {
    return this.request(`/admin/doctors/${id}/verification`, { method: 'PATCH', body: JSON.stringify({ status, notes }) });
  }
  reviewDocument(id: string, status: 'APPROVED' | 'REJECTED') {
    return this.request(`/admin/doctor-documents/${id}/review`, { method: 'PATCH', body: JSON.stringify({ status }) });
  }
  documentDownload(id: string) {
    return this.request<{ downloadUrl: string; fileName?: string; contentType?: string }>(`/admin/doctor-documents/${id}/download`);
  }
  patients() { return this.request<Patient[]>('/admin/patients'); }
  appointments() { return this.request<Appointment[]>('/admin/appointments'); }
  payments() { return this.request<Payment[]>('/admin/payments'); }
}

export interface Analytics {
  totalPatients: number; totalDoctors: number; verifiedDoctors: number; pendingVerification: number;
  todayAppointments: number; monthlyAppointments: number; grossBookingValuePaise: number; platformRevenuePaise: number;
}
export interface Doctor { id: string; status: string; experienceYears: number; clinicFeePaise: number; user: { displayName: string; phoneE164: string }; documents: Array<{ id: string; type: string; fileName?: string; uploadedAt?: string; status: string }>; specializations: Array<{ specialization: { nameEn: string } }> }
export interface Patient { id: string; user: { displayName: string; phoneE164: string; status: string }; createdAt: string }
export interface Appointment { id: string; publicId: string; status: string; startAt: string; totalPaise: number; patient: { user: { displayName: string } }; doctor: { user: { displayName: string } } }
export interface Payment { id: string; gatewayOrderId: string; status: string; amountPaise: number; createdAt: string }

export async function exchangeAdminToken(firebaseIdToken: string, displayName = 'CareBook Admin'): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/otp/exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ firebaseIdToken, role: 'ADMIN', displayName }),
  });
  if (!response.ok) throw new Error('This mobile number is not provisioned as an admin');
  const data = await response.json() as { accessToken: string };
  return data.accessToken;
}

export async function exchangeAdminLocalOtp(phone: string, localOtp: string): Promise<string> {
  const response = await fetch(`${API_BASE}/auth/otp/exchange`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone, localOtp, role: 'ADMIN', displayName: 'CareBook Test Admin' }),
  });
  if (!response.ok) throw new Error('Use the seeded test admin number and OTP');
  const data = await response.json() as { accessToken: string };
  return data.accessToken;
}
