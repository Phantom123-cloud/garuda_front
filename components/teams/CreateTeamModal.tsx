'use client';
import { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { teamsApi, type CreateTeamPayload } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Props {
  open: boolean;
  onClose: () => void;
}

export function CreateTeamModal({ open, onClose }: Props) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [form, setForm] = useState<CreateTeamPayload>({ name: '', managerId: undefined });

  const { mutate, isPending } = useMutation({
    mutationFn: teamsApi.create,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['teams'] });
      toast('Команда создана', 'success');
      setForm({ name: '', managerId: undefined });
      onClose();
    },
    onError: () => toast('Ошибка при создании команды', 'error'),
  });

  return (
    <Modal open={open} onClose={onClose} title="Новая команда">
      <div className="flex flex-col gap-4">
        <Input
          label="Название команды *"
          placeholder="Группа А"
          value={form.name}
          onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
        />
        <Input
          label="Менеджер (имя)"
          placeholder="Пока без менеджера"
          disabled
          className="opacity-50"
        />
        <p className="text-xs text-muted-foreground">
          Менеджер назначается из списка пользователей системы.
          Функция будет доступна после добавления пользователей.
        </p>
        <div className="flex gap-3 pt-2">
          <Button
            disabled={!form.name.trim()}
            loading={isPending}
            onClick={() => mutate(form)}
          >
            Создать
          </Button>
          <Button variant="secondary" onClick={onClose}>Отмена</Button>
        </div>
      </div>
    </Modal>
  );
}
