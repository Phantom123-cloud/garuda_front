'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { operatorsApi, teamsApi, type CreateOperatorPayload } from '@/lib/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onClose: () => void;
}

const empty: CreateOperatorPayload = {
  name: '', login: '', password: '', extension: '', teamId: undefined, canReceiveInbound: false,
};

export function CreateOperatorModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateOperatorPayload>(empty);
  const [errors, setErrors] = useState<Partial<Record<keyof CreateOperatorPayload, string>>>({});

  const { data: teams = [] } = useQuery({ queryKey: ['teams'], queryFn: teamsApi.getAll });

  const { mutate, isPending } = useMutation({
    mutationFn: operatorsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['operators'] });
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast('Оператор создан', 'success');
      setForm(empty);
      setErrors({});
      onClose();
    },
    onError: (e: any) => {
      const msg = e?.response?.data?.message ?? 'Ошибка при создании';
      if (msg.includes('Login')) setErrors(p => ({ ...p, login: 'Логин уже занят' }));
      else toast(msg, 'error');
    },
  });

  const set = (field: keyof CreateOperatorPayload) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
      setForm(p => ({ ...p, [field]: e.target.value || undefined }));

  const validate = () => {
    const e: typeof errors = {};
    if (!form.name.trim())     e.name = 'Обязательное поле';
    if (!form.login.trim())    e.login = 'Обязательное поле';
    if (form.password.length < 6) e.password = 'Минимум 6 символов';
    setErrors(e);
    return !Object.keys(e).length;
  };

  return (
    <Modal open={open} onClose={onClose} title="Новый оператор">
      <div className="flex flex-col gap-4">
        <Input
          label="Имя оператора *"
          placeholder="Иванов Алексей Владимирович"
          value={form.name}
          onChange={set('name')}
          error={errors.name}
        />
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Логин *"
            placeholder="ivanov.av"
            value={form.login}
            onChange={set('login')}
            error={errors.login}
          />
          <Input
            label="Пароль *"
            type="password"
            placeholder="••••••••"
            value={form.password}
            onChange={set('password')}
            error={errors.password}
          />
        </div>
        <Select
          label="Команда"
          value={form.teamId?.toString() ?? ''}
          onChange={e => setForm(p => ({ ...p, teamId: e.target.value ? Number(e.target.value) : undefined }))}
        >
          <option value="">— Без команды —</option>
          {teams.map((t: any) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </Select>
        {/* [INBOUND HIDDEN] canReceiveInbound toggle */}

        <div className="flex gap-3 pt-2">
          <Button loading={isPending} onClick={() => validate() && mutate(form)}>
            Создать
          </Button>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </Modal>
  );
}
