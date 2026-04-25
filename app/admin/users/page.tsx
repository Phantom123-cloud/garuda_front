'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { usersApi, rolesApi, type User, type Role } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Table, Thead, Tbody, Th, Tr, Td, Avatar } from '@/components/ui/table';
import { Badge, StatusBadge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { RowMenu } from '@/components/ui/row-menu';
import { formatDate } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import { StatusFilter } from '@/components/ui/status-filter';
type SF = 'ACTIVE' | 'BLOCKED' | 'ALL';

const PAGE_SIZE = 15;


const EMPTY = { name: '', login: '', password: '', customRoleId: '' };

export default function UsersPage() {
  useRequirePermission('USERS_VIEW');
  const { toast } = useToast();
  const { can } = useAuth();
  const canManage = can('USERS_MANAGE');
  const qc = useQueryClient();

  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ ...EMPTY });
  const [errors, setErrors] = useState<any>({});

  const [editModal, setEditModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ name: '', password: '', customRoleId: '' });
  const [editErrors, setEditErrors] = useState<any>({});

  const [filter, setFilter] = useState<SF>('ACTIVE');
  const [page, setPage]     = useState(1);
  const changeFilter = (f: SF) => { setFilter(f); setPage(1); };

  const { data: users = [], isLoading } = useQuery<User[]>({
    queryKey: ['users'], queryFn: usersApi.getAll,
  });

  const { data: roles = [] } = useQuery<Role[]>({
    queryKey: ['roles'], queryFn: rolesApi.getAll,
  });

  const create = useMutation({
    mutationFn: () => usersApi.create({
      name: form.name,
      login: form.login,
      password: form.password,
      customRoleId: form.customRoleId ? Number(form.customRoleId) : null,
    }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Пользователь создан', 'success'); setModal(false); setForm({ ...EMPTY }); },
    onError: (e: any) => { if (e?.response?.data?.message?.includes('Login')) setErrors({ login: 'Логин занят' }); else toast('Ошибка', 'error'); },
  });

  const update = useMutation({
    mutationFn: () => {
      const data: any = {
        name: editForm.name,
        customRoleId: editForm.customRoleId ? Number(editForm.customRoleId) : null,
      };
      if (editForm.password.trim()) data.password = editForm.password;
      return usersApi.update(editId!, data);
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Пользователь обновлён', 'success'); setEditModal(false); },
    onError: () => toast('Ошибка при обновлении', 'error'),
  });

  const toggle = useMutation({
    mutationFn: (id: number) => usersApi.toggleStatus(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Статус обновлён', 'success'); },
  });

  const remove = useMutation({
    mutationFn: (id: number) => usersApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['users'] }); toast('Пользователь удалён', 'success'); },
  });

  const validate = () => {
    const e: any = {};
    if (!form.name.trim()) e.name = 'Обязательное поле';
    if (!form.login.trim()) e.login = 'Обязательное поле';
    if (form.password.length < 6) e.password = 'Минимум 6 символов';
    setErrors(e); return !Object.keys(e).length;
  };

  const validateEdit = () => {
    const e: any = {};
    if (!editForm.name.trim()) e.name = 'Обязательное поле';
    if (editForm.password && editForm.password.length < 6) e.password = 'Минимум 6 символов';
    setEditErrors(e); return !Object.keys(e).length;
  };

  const openEdit = (u: User) => {
    setEditId(u.id);
    setEditForm({ name: u.name, password: '', customRoleId: u.customRoleId ? String(u.customRoleId) : '' });
    setEditErrors({});
    setEditModal(true);
  };

  /** Display label: custom role name or dash */
  const roleBadge = (u: User) => {
    if (u.customRole) return { label: u.customRole.name, variant: 'default' as const };
    return { label: '—', variant: 'default' as const };
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Пользователи</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Доступ к административной панели</p>
        </div>
        {canManage && <Button onClick={() => setModal(true)}><Plus size={15} /> Добавить пользователя</Button>}
      </div>

      {(() => {
        const filtered = users.filter(u => filter === 'ALL' ? true : u.status === filter);
        const paged    = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
        const counts   = {
          active:  users.filter(u => u.status === 'ACTIVE').length,
          blocked: users.filter(u => u.status === 'BLOCKED').length,
          all:     users.length,
        };
        return (
          <>
            <div className="flex items-center mb-4">
              <StatusFilter value={filter} onChange={changeFilter} counts={counts} />
            </div>
            <div className="bg-card border border-border rounded-xl overflow-hidden">
              <Table>
                <Thead><tr>
                  <Th>Пользователь</Th><Th>Логин</Th><Th>Роль</Th>
                  <Th>Дата создания</Th><Th>Статус</Th>{canManage && <Th />}
                </tr></Thead>
                <Tbody>
                  {!isLoading && paged.length === 0 && (
                    <Tr><Td className="text-center text-muted-foreground py-10" colSpan={6}>
                      {users.length === 0 ? 'Пользователей пока нет' : 'Нет пользователей с таким статусом'}
                    </Td></Tr>
                  )}
                  {paged.map(u => {
                    const { label, variant } = roleBadge(u);
                    return (
                      <Tr key={u.id}>
                        <Td><div className="flex items-center gap-2.5"><Avatar name={u.name} /><span className="font-medium">{u.name}</span></div></Td>
                        <Td><code className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">{u.login}</code></Td>
                        <Td><Badge variant={variant}>{label}</Badge></Td>
                        <Td className="text-muted-foreground">{formatDate(u.createdAt)}</Td>
                        <Td><StatusBadge status={u.status} /></Td>
                        {canManage && (
                          <Td><RowMenu
                            status={u.status}
                            onEdit={() => openEdit(u)}
                            onToggle={() => toggle.mutate(u.id)}
                            onDelete={() => { if (confirm(`Удалить «${u.name}»?`)) remove.mutate(u.id); }}
                          /></Td>
                        )}
                      </Tr>
                    );
                  })}
                </Tbody>
              </Table>
              <Pagination page={page} total={filtered.length} limit={PAGE_SIZE} onChange={setPage} />
            </div>
          </>
        );
      })()}

      {/* Create modal — only accessible with USERS_MANAGE */}
      <Modal open={canManage && modal} onClose={() => setModal(false)} title="Новый пользователь">
        <div className="flex flex-col gap-4">
          <Input label="Имя *" placeholder="Иванов Алексей" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} error={errors.name} />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Логин *" placeholder="ivanov.a" value={form.login} onChange={e => setForm(p => ({ ...p, login: e.target.value }))} error={errors.login} />
            <Input label="Пароль *" type="password" placeholder="••••••••" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} error={errors.password} />
          </div>
          <Select
            label="Кастомная роль (права доступа)"
            value={form.customRoleId}
            onChange={e => setForm(p => ({ ...p, customRoleId: e.target.value }))}
          >
            <option value="">— Не назначена —</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <div className="flex gap-3 pt-2">
            <Button loading={create.isPending} onClick={() => validate() && create.mutate()}>Создать</Button>
            <Button variant="secondary" onClick={() => setModal(false)}>Отмена</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal — only accessible with USERS_MANAGE */}
      <Modal open={canManage && editModal} onClose={() => setEditModal(false)} title="Редактировать пользователя">
        <div className="flex flex-col gap-4">
          <Input
            label="Имя *"
            placeholder="Иванов Алексей"
            value={editForm.name}
            onChange={e => setEditForm(p => ({ ...p, name: e.target.value }))}
            error={editErrors.name}
          />
          <Select
            label="Кастомная роль (права доступа)"
            value={editForm.customRoleId}
            onChange={e => setEditForm(p => ({ ...p, customRoleId: e.target.value }))}
          >
            <option value="">— Не назначена —</option>
            {roles.map(r => (
              <option key={r.id} value={r.id}>{r.name}</option>
            ))}
          </Select>
          <Input
            label="Новый пароль"
            type="password"
            placeholder="Оставьте пустым, если не меняете"
            value={editForm.password}
            onChange={e => setEditForm(p => ({ ...p, password: e.target.value }))}
            error={editErrors.password}
          />
          <div className="flex gap-3 pt-2">
            <Button loading={update.isPending} onClick={() => validateEdit() && update.mutate()}>Сохранить</Button>
            <Button variant="secondary" onClick={() => setEditModal(false)}>Отмена</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
