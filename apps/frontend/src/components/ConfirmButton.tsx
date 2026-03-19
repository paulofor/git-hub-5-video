import { useState } from 'react';
import clsx from 'clsx';

interface Props {
  onConfirm: () => Promise<void> | void;
  label?: string;
  confirmLabel?: string;
  disabled?: boolean;
}

export default function ConfirmButton({
  onConfirm,
  label = 'Executar',
  confirmLabel = 'Confirmar',
  disabled
}: Props) {
  const [awaiting, setAwaiting] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    if (loading) return;
    if (!awaiting) {
      setAwaiting(true);
      setTimeout(() => setAwaiting(false), 8000);
      return;
    }
    try {
      setLoading(true);
      await onConfirm();
    } finally {
      setLoading(false);
      setAwaiting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || loading}
      className={clsx(
        'rounded-md border px-4 py-2 text-sm font-semibold transition',
        awaiting
          ? 'border-orange-500 text-orange-500'
          : 'border-emerald-600 text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-900/40',
        (disabled || loading) && 'opacity-50 cursor-not-allowed'
      )}
    >
      {loading ? 'Processando...' : awaiting ? confirmLabel : label}
    </button>
  );
}
