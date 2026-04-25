'use client';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Info, Phone, AlertTriangle, CheckCircle2, XCircle, Clock, Wifi, Ban } from 'lucide-react';
import { useRequirePermission } from '@/hooks/useRequirePermission';

// ── Q.850 cause codes ─────────────────────────────────────────────────────────
const CAUSE_CODES = [
  // ── Успешные ──────────────────────────────────────────────────────────────
  { code: 16, group: 'success', dialResult: 'ANSWERED',    sip: '200 OK / BYE',      name: 'Нормальное завершение',          desc: 'Звонок был отвечен и завершён нормально обеими сторонами.' },
  // ── Клиент не ответил ────────────────────────────────────────────────────
  { code: 18, group: 'noanswer', dialResult: 'NO_ANSWER',  sip: '408 Timeout',        name: 'Нет ответа пользователя',        desc: 'Телефон звонит, но пользователь не снял трубку в течение таймаута.' },
  { code: 19, group: 'noanswer', dialResult: 'NO_ANSWER',  sip: '480 / 487',          name: 'Нет ответа',                     desc: 'Вызов отправлен, ответа нет. Наиболее распространённый код при отсутствии ответа.' },
  { code: 20, group: 'noanswer', dialResult: 'NO_ANSWER',  sip: '480 Unavailable',    name: 'Абонент недоступен',             desc: 'Телефон выключен, вне зоны покрытия, роуминг без переадресации.' },
  // ── Занято ───────────────────────────────────────────────────────────────
  { code: 17, group: 'busy',    dialResult: 'BUSY',        sip: '486 Busy Here',      name: 'Абонент занят',                  desc: 'Линия занята — абонент разговаривает.' },
  { code: 34, group: 'busy',    dialResult: 'ERROR',       sip: '503 Unavailable',    name: 'Нет свободных каналов',          desc: 'Перегрузка сети / провайдера, нет доступных линий для соединения.' },
  // ── Отклонено ────────────────────────────────────────────────────────────
  { code: 21, group: 'rejected', dialResult: 'REJECTED',   sip: '403 / 603 Decline',  name: 'Звонок отклонён',                desc: 'Абонент нажал "отклонить" или правило АТС запретило вызов.' },
  { code: 603, group: 'rejected', dialResult: 'REJECTED',  sip: '603 Decline',        name: 'SIP Отклонить',                  desc: 'SIP-устройство явно отвергло вызов (Decline).' },
  // ── Некорректный номер ───────────────────────────────────────────────────
  { code: 1,  group: 'invalid', dialResult: 'INVALID',     sip: '404 Not Found',      name: 'Номер не существует',            desc: 'Номер не выделен / не назначен оператором связи.' },
  { code: 3,  group: 'invalid', dialResult: 'INVALID',     sip: '404 Not Found',      name: 'Нет маршрута к номеру',          desc: 'Провайдер не знает, как маршрутизировать звонок на этот номер.' },
  { code: 22, group: 'invalid', dialResult: 'INVALID',     sip: '410 Gone',           name: 'Номер изменён',                  desc: 'Номер был изменён или перенесён, набор по старому номеру невозможен.' },
  { code: 28, group: 'invalid', dialResult: 'INVALID',     sip: '484 Address Incomplete', name: 'Неверный формат номера',    desc: 'Номер набран в неверном формате (напр., не хватает кода страны).' },
  // ── Ошибки сети / провайдера ─────────────────────────────────────────────
  { code: 27, group: 'error',   dialResult: 'ERROR',       sip: '502 Bad Gateway',    name: 'Пункт назначения недоступен',    desc: 'Сервер или устройство назначения не отвечает / не в сети.' },
  { code: 38, group: 'error',   dialResult: 'ERROR',       sip: '503 Service Unavail', name: 'Сеть недоступна',              desc: 'Временный сбой сети оператора.' },
  { code: 41, group: 'error',   dialResult: 'ERROR',       sip: '500 Server Error',   name: 'Временный сбой',                 desc: 'Временная проблема на стороне провайдера, обычно проходит само.' },
  { code: 47, group: 'error',   dialResult: 'ERROR',       sip: '503 Unavailable',    name: 'Ресурс недоступен',              desc: 'Ресурс (канал/порт) временно исчерпан.' },
  // ── Системные ────────────────────────────────────────────────────────────
  { code: 0,  group: 'system',  dialResult: 'CANCELLED',   sip: '487 Request Terminated', name: 'Нет причины (отмена)',       desc: 'Вызов завершён без кода. Обычно — оператор/система отменила набор.' },
];

// ── Dial result статусы нашей системы ───────────────────────────────────────
const DIAL_STATUSES = [
  {
    key: 'ACTIVE', label: 'Активный', color: 'text-gray-400', dot: 'bg-gray-400',
    retryable: true, done: false,
    desc: 'Номер ещё не набирался. Ожидает своей очереди в обзвоне.',
    causes: 'dialResult = null',
  },
  {
    key: 'NO_ANSWER', label: 'Нет ответа', color: 'text-gray-400', dot: 'bg-gray-400',
    retryable: true, done: false,
    desc: 'Клиент не снял трубку. Будет перенабран согласно расписанию.',
    causes: 'cause: 18, 19, 20 / reason: NOANSWER',
  },
  {
    key: 'BUSY', label: 'Занят', color: 'text-orange-400', dot: 'bg-orange-400',
    retryable: true, done: false,
    desc: 'Линия занята. Будет перенабран после интервала.',
    causes: 'cause: 17 / reason: BUSY',
  },
  {
    key: 'ANSWERED', label: 'Отвечено', color: 'text-green-400', dot: 'bg-green-400',
    retryable: false, done: true,
    desc: 'Клиент ответил, разговор состоялся. Оператор обработал звонок.',
    causes: 'cause: 16 + answeredAt',
  },
  {
    key: 'INTERRUPTED', label: 'Прервано', color: 'text-yellow-400', dot: 'bg-yellow-400',
    retryable: true, done: false,
    desc: 'Звонок был принят и мост установлен, но разговор прервался до того как оператор сохранил результат. Будет перенабран.',
    causes: 'cause: 16 + answeredAt + нет результата',
  },
  {
    key: 'REJECTED', label: 'Отклонено', color: 'text-red-400', dot: 'bg-red-400',
    retryable: false, done: true,
    desc: 'Клиент нажал "Отклонить". Считается результатом отказа.',
    causes: 'cause: 21, 603 / SIP 403, 603',
  },
  {
    key: 'INVALID', label: 'Некорректный номер', color: 'text-red-400', dot: 'bg-red-400',
    retryable: false, done: true,
    desc: 'Номер не существует или неверного формата. Повторный набор бессмыслен.',
    causes: 'cause: 1, 3, 22, 28 / reason: INVALID, UNALLOCATED',
  },
  {
    key: 'ERROR', label: 'Ошибка', color: 'text-yellow-400', dot: 'bg-yellow-400',
    retryable: true, done: false,
    desc: 'Временная ошибка сети или провайдера. Будет перенабран.',
    causes: 'cause: 27, 34, 38, 41, 47 / reason: CONGESTION',
  },
  {
    key: 'ERROR_CREATE', label: 'Ошибка создания', color: 'text-red-400', dot: 'bg-red-400',
    retryable: false, done: true,
    desc: 'Система не смогла создать исходящий вызов (нет кодека, неверный конфиг, AMI недоступен). Требует ручной проверки настроек.',
    causes: 'OriginateResponse: Failure + пустой reason',
  },
  {
    key: 'CANCELLED', label: 'Отменено', color: 'text-gray-400', dot: 'bg-gray-400',
    retryable: true, done: false,
    desc: 'Вызов создан, но завершён до ответа клиента (кампания остановлена, оператор отключился).',
    causes: 'cause: 16 + нет answeredAt',
  },
  {
    key: 'BLACKLISTED', label: 'Чёрный список', color: 'text-purple-400', dot: 'bg-purple-500',
    retryable: false, done: true,
    desc: 'Номер находится в чёрном списке. Набор заблокирован навсегда в рамках кампании.',
    causes: 'Проверка таблицы blacklist перед набором',
  },
];

const GROUP_LABELS: Record<string, string> = {
  success: 'Успешное завершение',
  noanswer: 'Нет ответа',
  busy: 'Занято / Перегрузка',
  rejected: 'Отклонено',
  invalid: 'Некорректный номер',
  error: 'Ошибка сети',
  system: 'Системные',
};

const GROUP_COLORS: Record<string, string> = {
  success: 'text-green-400 bg-green-500/10 border-green-500/20',
  noanswer: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
  busy: 'text-orange-400 bg-orange-500/10 border-orange-500/20',
  rejected: 'text-red-400 bg-red-500/10 border-red-500/20',
  invalid: 'text-red-400 bg-red-500/10 border-red-500/20',
  error: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20',
  system: 'text-gray-400 bg-gray-500/10 border-gray-500/20',
};

const DIAL_RESULT_COLORS: Record<string, string> = {
  ANSWERED: 'text-green-400 bg-green-500/10',
  NO_ANSWER: 'text-gray-400 bg-gray-500/10',
  BUSY: 'text-orange-400 bg-orange-500/10',
  REJECTED: 'text-red-400 bg-red-500/10',
  INVALID: 'text-red-400 bg-red-500/10',
  ERROR: 'text-yellow-400 bg-yellow-500/10',
  ERROR_CREATE: 'text-red-400 bg-red-500/10',
  CANCELLED: 'text-gray-400 bg-gray-500/10',
  INTERRUPTED: 'text-yellow-400 bg-yellow-500/10',
};

export default function CauseCodesPage() {
  useRequirePermission('CAUSE_CODES_VIEW');
  const router = useRouter();

  const groups = Array.from(new Set(CAUSE_CODES.map(c => c.group)));

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4 mb-8">
        <button onClick={() => router.back()}
          className="text-muted-foreground hover:text-foreground transition-colors p-1 hover:bg-accent rounded-md">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-xl font-semibold text-foreground">Справочник кодов завершения</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Коды причин Q.850 / SIP и их интерпретация в системе
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        {/* ── Left: Q.850 Cause codes ───────────────────────────────────────── */}
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
            Коды причин Asterisk (Q.850 / SIP)
          </h2>

          {groups.map(group => (
            <div key={group} className="bg-card border border-border rounded-xl overflow-hidden">
              <div className={`px-4 py-2.5 border-b border-border text-xs font-semibold uppercase tracking-wider ${GROUP_COLORS[group]} border`}>
                {GROUP_LABELS[group]}
              </div>
              <div className="divide-y divide-border">
                {CAUSE_CODES.filter(c => c.group === group).map(c => (
                  <div key={c.code} className="px-4 py-3 flex gap-3 items-start">
                    {/* Code badge */}
                    <span className="flex-shrink-0 w-10 h-6 flex items-center justify-center rounded bg-muted text-xs font-mono font-bold text-foreground mt-0.5">
                      {c.code}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="text-sm font-medium text-foreground">{c.name}</span>
                        <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded-full ${DIAL_RESULT_COLORS[c.dialResult] ?? 'text-muted-foreground bg-muted'}`}>
                          {c.dialResult}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{c.desc}</p>
                      <p className="text-[10px] text-muted-foreground/60 mt-1 font-mono">{c.sip}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* Note */}
          <div className="flex gap-2 bg-blue-500/10 border border-blue-500/20 rounded-xl p-4">
            <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-blue-300 leading-relaxed">
              Помимо кодов из Asterisk, причина завершения также приходит в поле <code className="bg-blue-500/20 px-1 rounded">reason</code> события <code className="bg-blue-500/20 px-1 rounded">OriginateResponse</code> (NOANSWER, BUSY, CONGESTION и др.) и маппируется аналогично.
            </p>
          </div>
        </div>

        {/* ── Right: Dial Result statuses ───────────────────────────────────── */}
        <div className="space-y-5">
          <h2 className="text-sm font-semibold text-foreground uppercase tracking-wider text-muted-foreground">
            Статусы набора номера в системе
          </h2>

          <div className="bg-card border border-border rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  <th className="px-4 py-2.5 text-left text-[11px] uppercase tracking-wider text-muted-foreground">Статус</th>
                  <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground">Повтор</th>
                  <th className="px-4 py-2.5 text-center text-[11px] uppercase tracking-wider text-muted-foreground">Завершён</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {DIAL_STATUSES.map(s => (
                  <tr key={s.key} className="hover:bg-accent/20 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
                        <span className={`text-sm font-medium ${s.color}`}>{s.label}</span>
                      </div>
                      <p className="text-xs text-muted-foreground leading-relaxed pl-4">{s.desc}</p>
                      <p className="text-[10px] text-muted-foreground/50 mt-1 pl-4 font-mono">{s.causes}</p>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.retryable
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={12} /> Да</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle size={12} /> Нет</span>
                      }
                    </td>
                    <td className="px-4 py-3 text-center">
                      {s.done
                        ? <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle2 size={12} /> Да</span>
                        : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><XCircle size={12} /> Нет</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Retry logic explanation */}
          <div className="bg-card border border-border rounded-xl p-5 space-y-3">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" /> Логика повторного набора
            </h3>
            <div className="space-y-2 text-xs text-muted-foreground">
              <div className="flex gap-2">
                <span className="text-foreground font-medium w-28 flex-shrink-0">maxAttempts</span>
                <span>Максимальное количество попыток на номер. По достижении — номер считается завершённым (done=true).</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-medium w-28 flex-shrink-0">retryInterval</span>
                <span>Минимальная пауза (в минутах) между попытками набора одного и того же номера.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-medium w-28 flex-shrink-0">done = true</span>
                <span>Номер выведен из обзвона навсегда. Происходит при: AGREED/REFUSE оператора, INVALID, REJECTED, BLACKLISTED, ERROR_CREATE.</span>
              </div>
              <div className="flex gap-2">
                <span className="text-foreground font-medium w-28 flex-shrink-0">done = false</span>
                <span>Номер будет перенабран: NO_ANSWER, BUSY, ERROR, CANCELLED, INTERRUPTED — до исчерпания maxAttempts.</span>
              </div>
            </div>
          </div>

          {/* Summary table: what matters for dialing */}
          <div className="bg-card border border-border rounded-xl p-5">
            <h3 className="text-sm font-medium text-foreground flex items-center gap-2 mb-3">
              <Wifi size={14} className="text-muted-foreground" /> Причины остановки обзвона
            </h3>
            <div className="space-y-2">
              {[
                { icon: <CheckCircle2 size={13} className="text-green-400" />, text: 'Все номера исчерпали попытки (attempts ≥ maxAttempts)' },
                { icon: <CheckCircle2 size={13} className="text-green-400" />, text: 'Все номера помечены done=true' },
                { icon: <AlertTriangle size={13} className="text-yellow-400" />, text: 'Нет операторов со свободным расширением' },
                { icon: <AlertTriangle size={13} className="text-yellow-400" />, text: 'Вышло за рабочее время (timeFrom–timeTo)' },
                { icon: <Ban size={13} className="text-red-400" />, text: 'Кампания остановлена вручную (STOPPED / BLOCKED)' },
              ].map((item, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <span className="flex-shrink-0 mt-0.5">{item.icon}</span>
                  <span>{item.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
