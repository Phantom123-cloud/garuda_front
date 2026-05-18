'use client';
import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, RefreshCw, X, UserPlus, PhoneIncoming } from 'lucide-react';
import { teamsApi, operatorsApi, usersApi, type Team, type Operator } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Modal } from '@/components/ui/modal';
import { Table, Thead, Tbody, Th, Tr, Td, Avatar } from '@/components/ui/table';
import { StatusBadge, OperatorStatusBadge } from '@/components/ui/badge';
import { CreateTeamModal } from '@/components/teams/CreateTeamModal';
import { CreateOperatorModal } from '@/components/teams/CreateOperatorModal';
import { useToast } from '@/components/ui/toast';
import { RowMenu } from '@/components/ui/row-menu';
import { formatDate } from '@/lib/utils';
import { Pagination } from '@/components/ui/pagination';
import { StatusFilter } from '@/components/ui/status-filter';
type SF = 'ACTIVE' | 'BLOCKED' | 'ALL';

const PAGE_SIZE = 15;

type Tab = 'teams' | 'operators';

export default function TeamsPage() {
  useRequirePermission('TEAMS_VIEW');
  const [tab, setTab] = useState<Tab>('teams');
  const [teamModal, setTeamModal] = useState(false);
  const [operatorModal, setOperatorModal] = useState(false);
  const { can } = useAuth();
  const canManage = can('TEAMS_MANAGE');

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Команды и операторы</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Управление структурой колл-центра</p>
        </div>
        {canManage && (
          <Button onClick={() => tab === 'teams' ? setTeamModal(true) : setOperatorModal(true)}>
            <Plus size={15} />
            {tab === 'teams' ? 'Добавить команду' : 'Добавить оператора'}
          </Button>
        )}
      </div>

      <div className="flex border-b border-border mb-6">
        {(['teams', 'operators'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={[
              'px-5 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors duration-150',
              tab === t ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground',
            ].join(' ')}
          >
            {t === 'teams' ? 'Команды' : 'Операторы'}
          </button>
        ))}
      </div>

      {tab === 'teams'     && <TeamsTab />}
      {tab === 'operators' && <OperatorsTab />}

      {canManage && <CreateTeamModal     open={teamModal}     onClose={() => setTeamModal(false)} />}
      {canManage && <CreateOperatorModal open={operatorModal} onClose={() => setOperatorModal(false)} />}
    </div>
  );
}

// ─── Teams Tab ────────────────────────────────────────────────────────────────

function TeamsTab() {
  const { toast } = useToast();
  const { can } = useAuth();
  const canManage = can('TEAMS_MANAGE');
  const qc = useQueryClient();

  const [editId, setEditId]       = useState<number | null>(null);
  const [filter, setFilter]       = useState<SF>('ACTIVE');
  const [page, setPage]           = useState(1);

  const { data: teams = [], isLoading } = useQuery<Team[]>({
    queryKey: ['teams'],
    queryFn: teamsApi.getAll,
  });

  const toggle = useMutation({
    mutationFn: (id: number) => teamsApi.toggleStatus(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast('Статус обновлён', 'success'); },
    onError: () => toast('Ошибка', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => teamsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teams'] }); toast('Команда удалена', 'success'); },
    onError: () => toast('Нельзя удалить команду с операторами', 'error'),
  });

  const filtered = teams.filter(t =>
    filter === 'ALL' ? true : t.status === filter
  );
  const total = filtered.length;
  const paged = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    active:  teams.filter(t => t.status === 'ACTIVE').length,
    blocked: teams.filter(t => t.status === 'BLOCKED').length,
    all:     teams.length,
  };

  // Reset page when filter changes
  const changeFilter = (f: SF) => { setFilter(f); setPage(1); };

  if (isLoading) return <Skeleton />;

  return (
    <>
      <div className="flex items-center mb-4">
        <StatusFilter value={filter} onChange={changeFilter} counts={counts} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <Thead>
            <tr>
              <Th>Название</Th>
              <Th>Менеджер</Th>
              <Th>Операторов</Th>
              <Th>Дата создания</Th>
              <Th>Статус</Th>
              {canManage && <Th />}
            </tr>
          </Thead>
          <Tbody>
            {paged.length === 0 && (
              <Tr>
                <Td className="text-center text-muted-foreground py-10" colSpan={6}>
                  {teams.length === 0 ? 'Команд пока нет — создайте первую' : 'Нет команд с таким статусом'}
                </Td>
              </Tr>
            )}
            {paged.map(team => (
              <Tr key={team.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={team.name} />
                    <span className="font-medium">{team.name}</span>
                  </div>
                </Td>
                <Td>{team.manager?.name ?? <span className="text-muted-foreground">—</span>}</Td>
                <Td>
                  <span className="bg-accent border border-border rounded-full px-2 py-0.5 text-xs">
                    {team._count?.operators ?? 0}
                  </span>
                </Td>
                <Td className="text-muted-foreground">{formatDate(team.createdAt)}</Td>
                <Td><StatusBadge status={team.status} /></Td>
                {canManage && (
                  <Td>
                    <RowMenu
                      status={team.status}
                      onEdit={() => setEditId(team.id)}
                      onToggle={() => toggle.mutate(team.id)}
                      onDelete={() => { if (confirm(`Удалить команду «${team.name}»?`)) remove.mutate(team.id); }}
                      deleteLabel="Удалить команду"
                    />
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
        <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
      </div>

      {editId !== null && (
        <EditTeamModal teamId={editId} onClose={() => setEditId(null)} />
      )}
    </>
  );
}

// ─── Edit Team Modal ──────────────────────────────────────────────────────────

function EditTeamModal({ teamId, onClose }: { teamId: number; onClose: () => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();

  const [name, setName] = useState('');
  const [managerId, setManagerId] = useState<string>('');
  // set of operator IDs currently assigned to this team (local editable state)
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  // Load team with operators
  const { data: team, isLoading: loadingTeam } = useQuery({
    queryKey: ['teams', teamId],
    queryFn: () => teamsApi.getOne(teamId),
  });

  useEffect(() => {
    if (team) {
      setName((team as any).name);
      setManagerId((team as any).managerId?.toString() ?? '');
      setMemberIds(new Set(((team as any).operators ?? []).map((o: any) => o.id as number)));
    }
  }, [team]);

  const { data: allOperators = [] } = useQuery<Operator[]>({
    queryKey: ['operators'],
    queryFn: () => operatorsApi.getAll(),
  });

  const { data: users = [] } = useQuery({
    queryKey: ['users'],
    queryFn: usersApi.getAll,
  });

  const save = useMutation({
    mutationFn: async () => {
      // 1. Update team name + manager
      await teamsApi.update(teamId, {
        name: name.trim(),
        managerId: managerId ? Number(managerId) : null,
      });

      // 2. Sync operator assignments
      const originalIds = new Set((team?.operators ?? []).map((o: any) => o.id as number));

      const toAdd    = Array.from(memberIds as Set<number>).filter(id => !originalIds.has(id));
      const toRemove = Array.from(originalIds as Set<number>).filter(id => !(memberIds as Set<number>).has(id));

      await Promise.all([
        ...toAdd.map(id => operatorsApi.update(id, { teamId })),
        ...toRemove.map(id => operatorsApi.update(id, { teamId: null })),
      ]);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      qc.invalidateQueries({ queryKey: ['operators'] });
      toast('Команда обновлена', 'success');
      onClose();
    },
    onError: () => toast('Ошибка при сохранении', 'error'),
  });

  const toggleMember = (id: number) => {
    setMemberIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const members   = (allOperators as any[]).filter(o => memberIds.has(o.id));
  const available = (allOperators as any[]).filter(o => !memberIds.has(o.id));

  return (
    <Modal open onClose={onClose} title="Редактировать команду" width="w-[600px]">
      {loadingTeam ? (
        <div className="flex items-center justify-center py-10">
          <RefreshCw size={20} className="animate-spin text-muted-foreground" />
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {/* Basic info */}
          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Название команды *"
              placeholder="Группа А"
              value={name}
              onChange={e => setName(e.target.value)}
            />
            <Select
              label="Менеджер"
              value={managerId}
              onChange={e => setManagerId(e.target.value)}
            >
              <option value="">— Без менеджера —</option>
              {(users as any[]).map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </Select>
          </div>

          {/* Operators */}
          <div>
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
              Состав команды ({memberIds.size})
            </p>
            {members.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">Нет операторов — добавьте из списка ниже</p>
            ) : (
              <div className="flex flex-col gap-1 mb-3">
                {members.map((op: any) => (
                  <div key={op.id} className="flex items-center justify-between px-3 py-2 bg-accent rounded-lg border border-border">
                    <div className="flex items-center gap-2">
                      <Avatar name={op.name} />
                      <span className="text-sm font-medium">{op.name}</span>
                      <code className="text-xs text-muted-foreground">{op.login}</code>
                    </div>
                    <button
                      onClick={() => toggleMember(op.id)}
                      className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      title="Убрать из команды"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {available.length > 0 && (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 mt-3">
                  Доступные операторы
                </p>
                <div className="flex flex-col gap-1 max-h-48 overflow-y-auto">
                  {available.map((op: any) => (
                    <div key={op.id} className="flex items-center justify-between px-3 py-2 rounded-lg border border-border hover:border-primary/40 transition-colors">
                      <div className="flex items-center gap-2">
                        <Avatar name={op.name} />
                        <span className="text-sm">{op.name}</span>
                        <code className="text-xs text-muted-foreground">{op.login}</code>
                        {op.team && (
                          <span className="text-xs text-muted-foreground bg-background px-1.5 py-0.5 rounded">
                            {op.team.name}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={() => toggleMember(op.id)}
                        className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                        title="Добавить в команду"
                      >
                        <UserPlus size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          <div className="flex gap-3 pt-1">
            <Button loading={save.isPending} disabled={!name.trim()} onClick={() => save.mutate()}>
              Сохранить
            </Button>
            <Button variant="secondary" onClick={onClose}>Отмена</Button>
          </div>
        </div>
      )}
    </Modal>
  );
}

// ─── Operators Tab ────────────────────────────────────────────────────────────

function OperatorsTab() {
  const { toast } = useToast();
  const { can } = useAuth();
  const canManage = can('TEAMS_MANAGE');
  const qc = useQueryClient();

  const [editModal, setEditModal] = useState(false);
  const [editId, setEditId]       = useState<number | null>(null);
  const [editForm, setEditForm]   = useState({ name: '', password: '', extension: '', teamId: '' as string, canReceiveInbound: false });
  const [filter, setFilter]       = useState<SF>('ACTIVE');
  const [page, setPage]           = useState(1);

  const { data: operators = [], isLoading } = useQuery<Operator[]>({
    queryKey: ['operators'],
    queryFn: () => operatorsApi.getAll(),
  });

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.getAll });

  const update = useMutation({
    mutationFn: () => {
      const data: any = {
        name: editForm.name,
        extension: editForm.extension || null,
        teamId: editForm.teamId ? Number(editForm.teamId) : null,
        canReceiveInbound: editForm.canReceiveInbound,
      };
      if (editForm.password.trim()) data.password = editForm.password;
      return operatorsApi.update(editId!, data);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operators'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast('Оператор обновлён', 'success');
      setEditModal(false);
    },
    onError: () => toast('Ошибка при обновлении', 'error'),
  });

  const toggle = useMutation({
    mutationFn: (id: number) => operatorsApi.toggleStatus(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operators'] }); toast('Статус обновлён', 'success'); },
    onError: () => toast('Ошибка', 'error'),
  });

  const remove = useMutation({
    mutationFn: (id: number) => operatorsApi.remove(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['operators'] }); toast('Оператор удалён', 'success'); },
    onError: () => toast('Ошибка при удалении', 'error'),
  });

  const openEdit = (op: Operator) => {
    setEditId(op.id);
    setEditForm({ name: op.name, password: '', extension: (op as any).extension ?? '', teamId: op.team?.id?.toString() ?? '', canReceiveInbound: (op as any).canReceiveInbound ?? false });
    setEditModal(true);
  };

  const setField = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setEditForm(p => ({ ...p, [field]: e.target.value }));

  const filtered = operators.filter(o => filter === 'ALL' ? true : o.status === filter);
  const total    = filtered.length;
  const paged    = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const counts = {
    active:  operators.filter(o => o.status === 'ACTIVE').length,
    blocked: operators.filter(o => o.status === 'BLOCKED').length,
    all:     operators.length,
  };

  const changeFilter = (f: SF) => { setFilter(f); setPage(1); };

  if (isLoading) return <Skeleton />;

  return (
    <>
      <div className="flex items-center mb-4">
        <StatusFilter value={filter} onChange={changeFilter} counts={counts} />
      </div>

      <div className="bg-card border border-border rounded-xl overflow-hidden">
        <Table>
          <Thead>
            <tr>
              <Th>Оператор</Th>
              <Th>Логин</Th>
              <Th>Добавочный</Th>
              <Th>Команда</Th>
              <Th>Дата создания</Th>
              <Th>Статус</Th>
              {canManage && <Th />}
            </tr>
          </Thead>
          <Tbody>
            {paged.length === 0 && (
              <Tr>
                <Td className="text-center text-muted-foreground py-10" colSpan={7}>
                  {operators.length === 0 ? 'Операторов пока нет — создайте первого' : 'Нет операторов с таким статусом'}
                </Td>
              </Tr>
            )}
            {paged.map(op => (
              <Tr key={op.id}>
                <Td>
                  <div className="flex items-center gap-2.5">
                    <Avatar name={op.name} />
                    <span className="font-medium">{op.name}</span>
                    {/* [INBOUND HIDDEN] canReceiveInbound badge */}
                  </div>
                </Td>
                <Td>
                  <code className="text-xs text-muted-foreground bg-background px-2 py-0.5 rounded">
                    {op.login}
                  </code>
                </Td>
                <Td>
                  {(op as any).extension
                    ? <code className="text-xs text-primary">{(op as any).extension}</code>
                    : <span className="text-muted-foreground">—</span>}
                </Td>
                <Td>{op.team?.name ?? <span className="text-muted-foreground">—</span>}</Td>
                <Td className="text-muted-foreground">{formatDate(op.createdAt)}</Td>
                <Td><OperatorStatusBadge status={op.status} /></Td>
                {canManage && (
                  <Td>
                    <RowMenu
                      status={op.status}
                      onEdit={() => openEdit(op)}
                      onToggle={() => toggle.mutate(op.id)}
                      onDelete={() => { if (confirm(`Удалить оператора «${op.name}»?`)) remove.mutate(op.id); }}
                      deleteLabel="Удалить оператора"
                    />
                  </Td>
                )}
              </Tr>
            ))}
          </Tbody>
        </Table>
        <Pagination page={page} total={total} limit={PAGE_SIZE} onChange={setPage} />
      </div>

      <Modal open={canManage && editModal} onClose={() => setEditModal(false)} title="Редактировать оператора">
        <div className="flex flex-col gap-4">
          <Input label="Имя оператора *" placeholder="Иванов Алексей" value={editForm.name} onChange={setField('name')} />
          <Input label="Новый пароль" type="password" placeholder="Оставьте пустым, если не меняете" value={editForm.password} onChange={setField('password')} />
          <Input
            label="Добавочный (SIP)"
            placeholder={editForm.extension ? editForm.extension : 'авто'}
            value={editForm.extension}
            onChange={setField('extension')}
            hint={editForm.extension ? `Текущий: ${editForm.extension}` : 'Будет назначен автоматически при создании'}
          />
          <Select label="Команда" value={editForm.teamId} onChange={setField('teamId')}>
            <option value="">— Без команды —</option>
            {(teams as any[]).map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </Select>
          {/* [INBOUND HIDDEN] canReceiveInbound toggle */}
          <div className="flex gap-3 pt-2">
            <Button loading={update.isPending} disabled={!editForm.name.trim()} onClick={() => update.mutate()}>Сохранить</Button>
            <Button variant="secondary" onClick={() => setEditModal(false)}>Отмена</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Skeleton() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 flex items-center justify-center">
      <RefreshCw size={20} className="animate-spin text-muted-foreground" />
    </div>
  );
}
