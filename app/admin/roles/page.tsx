'use client';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Pencil, Trash2, Shield } from 'lucide-react';
import { useRequirePermission } from '@/hooks/useRequirePermission';
import { rolesApi, type Role } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';

// ─── Permission catalogue (must match backend) ────────────────────────────────
const PERMISSION_GROUPS = [
  {
    label: 'Мониторинг',
    items: [
      { key: 'MONITOR_VIEW',   label: 'Просмотр монитора' },
      { key: 'MONITOR_MANAGE', label: 'Управление монитором' },
    ],
  },
  {
    label: 'Пользователи и команды',
    items: [
      { key: 'USERS_VIEW',   label: 'Просмотр пользователей' },
      { key: 'USERS_MANAGE', label: 'Управление пользователями' },
      { key: 'ROLES_MANAGE', label: 'Управление ролями' },
      { key: 'TEAMS_VIEW',   label: 'Просмотр команд/операторов' },
      { key: 'TEAMS_MANAGE', label: 'Управление командами/операторами' },
    ],
  },
  {
    label: 'Кампании',
    items: [
      { key: 'CAMPAIGNS_VIEW',   label: 'Просмотр кампаний' },
      { key: 'CAMPAIGNS_MANAGE', label: 'Управление кампаниями' },
      { key: 'IMPORT_HISTORY_VIEW', label: 'История импортов' },
    ],
  },
  {
    label: 'Контент',
    items: [
      { key: 'FORMS_MANAGE',     label: 'Управление формами' },
      { key: 'SCRIPTS_MANAGE',   label: 'Управление скриптами' },
      { key: 'BLACKLIST_MANAGE', label: 'Управление чёрным списком' },
    ],
  },
  {
    label: 'Аналитика и система',
    items: [
      { key: 'REPORTS_VIEW',      label: 'Отчёты' },
      { key: 'PROVIDERS_MANAGE',  label: 'Управление провайдерами' },
      { key: 'MEDIA_VIEW',        label: 'Мультимедиа' },
      { key: 'CAUSE_CODES_VIEW',  label: 'Коды завершения' },
      { key: 'SETTINGS_MANAGE',   label: 'Управление стопами' },
    ],
  },
];

const ALL_PERMS = PERMISSION_GROUPS.flatMap(g => g.items.map(i => i.key));

function PermissionPicker({
  value,
  onChange,
}: {
  value: string[];
  onChange: (perms: string[]) => void;
}) {
  const toggle = (key: string) =>
    onChange(value.includes(key) ? value.filter(p => p !== key) : [...value, key]);

  const toggleGroup = (keys: string[]) => {
    const allOn = keys.every(k => value.includes(k));
    if (allOn) onChange(value.filter(p => !keys.includes(p)));
    else onChange([...new Set([...value, ...keys])]);
  };

  const toggleAll = () => {
    if (value.length === ALL_PERMS.length) onChange([]);
    else onChange([...ALL_PERMS]);
  };

  return (
    <div className="space-y-4">
      <label className="flex items-center gap-2 text-sm font-medium cursor-pointer select-none">
        <input
          type="checkbox"
          className="accent-primary"
          checked={value.length === ALL_PERMS.length}
          onChange={toggleAll}
        />
        Все права
      </label>
      {PERMISSION_GROUPS.map(group => {
        const keys = group.items.map(i => i.key);
        const allOn = keys.every(k => value.includes(k));
        const someOn = !allOn && keys.some(k => value.includes(k));
        return (
          <div key={group.label} className="border border-border rounded-lg p-3 space-y-2">
            <label className="flex items-center gap-2 text-[13px] font-semibold text-foreground cursor-pointer select-none">
              <input
                type="checkbox"
                className="accent-primary"
                checked={allOn}
                ref={el => { if (el) el.indeterminate = someOn; }}
                onChange={() => toggleGroup(keys)}
              />
              {group.label}
            </label>
            <div className="grid grid-cols-2 gap-1.5 pl-5">
              {group.items.map(item => (
                <label key={item.key} className="flex items-center gap-2 text-[12px] text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors">
                  <input
                    type="checkbox"
                    className="accent-primary"
                    checked={value.includes(item.key)}
                    onChange={() => toggle(item.key)}
                  />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Role card ────────────────────────────────────────────────────────────────
function RoleCard({ role, onEdit, onDelete }: { role: Role; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
            <Shield size={15} className="text-primary" />
          </div>
          <div>
            <div className="text-sm font-semibold text-foreground">{role.name}</div>
            <div className="text-[11px] text-muted-foreground">
              {role.permissions.length} прав · {role._count?.users ?? 0} польз.
            </div>
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={onEdit}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
          >
            <Pencil size={13} />
          </button>
          <button
            onClick={onDelete}
            className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {role.permissions.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {role.permissions.slice(0, 6).map(p => {
            const found = PERMISSION_GROUPS.flatMap(g => g.items).find(i => i.key === p);
            return (
              <span key={p} className="text-[10px] px-1.5 py-0.5 bg-primary/8 text-primary rounded font-medium">
                {found?.label ?? p}
              </span>
            );
          })}
          {role.permissions.length > 6 && (
            <span className="text-[10px] px-1.5 py-0.5 bg-muted text-muted-foreground rounded">
              +{role.permissions.length - 6}
            </span>
          )}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground italic">Нет назначенных прав</p>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function RolesPage() {
  useRequirePermission('ROLES_MANAGE');
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: roles = [], isLoading } = useQuery<Role[]>({
    queryKey: ['roles'],
    queryFn: rolesApi.getAll,
  });

  // Create modal
  const [createModal, setCreateModal] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPerms, setCreatePerms] = useState<string[]>([]);

  // Edit modal
  const [editModal, setEditModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [editName, setEditName] = useState('');
  const [editPerms, setEditPerms] = useState<string[]>([]);

  const createMutation = useMutation({
    mutationFn: () => rolesApi.create({ name: createName.trim(), permissions: createPerms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast('Роль создана', 'success');
      setCreateModal(false);
      setCreateName('');
      setCreatePerms([]);
    },
    onError: (e: any) => {
      if (e?.response?.data?.message?.includes('already')) toast('Название занято', 'error');
      else toast('Ошибка при создании', 'error');
    },
  });

  const updateMutation = useMutation({
    mutationFn: () => rolesApi.update(editId!, { name: editName.trim(), permissions: editPerms }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast('Роль обновлена', 'success');
      setEditModal(false);
    },
    onError: () => toast('Ошибка при обновлении', 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => rolesApi.remove(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['roles'] });
      toast('Роль удалена', 'success');
    },
    onError: () => toast('Ошибка при удалении', 'error'),
  });

  const openEdit = (role: Role) => {
    setEditId(role.id);
    setEditName(role.name);
    setEditPerms([...role.permissions]);
    setEditModal(true);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Роли</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Управление правами доступа</p>
        </div>
        <Button onClick={() => setCreateModal(true)}>
          <Plus size={15} /> Создать роль
        </Button>
      </div>

      {isLoading ? (
        <div className="text-muted-foreground text-sm">Загрузка...</div>
      ) : roles.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground text-sm">
          Ролей пока нет. Создайте первую.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {roles.map(role => (
            <RoleCard
              key={role.id}
              role={role}
              onEdit={() => openEdit(role)}
              onDelete={() => {
                if (confirm(`Удалить роль «${role.name}»? Пользователи потеряют её права.`))
                  deleteMutation.mutate(role.id);
              }}
            />
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={createModal} onClose={() => setCreateModal(false)} title="Новая роль">
        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Название роли *"
            placeholder="Менеджер"
            value={createName}
            onChange={e => setCreateName(e.target.value)}
          />
          <div>
            <div className="text-[13px] font-medium text-foreground mb-2">Права доступа</div>
            <PermissionPicker value={createPerms} onChange={setCreatePerms} />
          </div>
          <div className="flex gap-3 pt-2 sticky bottom-0 bg-background/80 backdrop-blur-sm -mx-1 px-1 pb-1">
            <Button
              loading={createMutation.isPending}
              onClick={() => {
                if (!createName.trim()) { toast('Введите название роли', 'error'); return; }
                createMutation.mutate();
              }}
            >
              Создать
            </Button>
            <Button variant="secondary" onClick={() => setCreateModal(false)}>Отмена</Button>
          </div>
        </div>
      </Modal>

      {/* Edit modal */}
      <Modal open={editModal} onClose={() => setEditModal(false)} title="Редактировать роль">
        <div className="flex flex-col gap-4 max-h-[70vh] overflow-y-auto pr-1">
          <Input
            label="Название роли *"
            value={editName}
            onChange={e => setEditName(e.target.value)}
          />
          <div>
            <div className="text-[13px] font-medium text-foreground mb-2">Права доступа</div>
            <PermissionPicker value={editPerms} onChange={setEditPerms} />
          </div>
          <div className="flex gap-3 pt-2 sticky bottom-0 bg-background/80 backdrop-blur-sm -mx-1 px-1 pb-1">
            <Button
              loading={updateMutation.isPending}
              onClick={() => {
                if (!editName.trim()) { toast('Введите название роли', 'error'); return; }
                updateMutation.mutate();
              }}
            >
              Сохранить
            </Button>
            <Button variant="secondary" onClick={() => setEditModal(false)}>Отмена</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
