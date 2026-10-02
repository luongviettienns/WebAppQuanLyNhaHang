import React, { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import type { CashbookPaymentMethod, FinancialAccountDto } from '../../api/cashbook';
import { fetchCashbookSettingsApi } from '../../api/cashbook';
import { useTheme } from '../../contexts/ThemeContext';
import { spacing, typography } from '../../theme';
import { InlineAlert } from '../../ui/Feedback';
import { Choice } from './CashbookChoice';
export { isCashbookAccountSelectionSatisfied } from './cashbookAccountRequirement';

const accountTypeFor = (method: CashbookPaymentMethod) => method === 'CASH' ? 'CASH' : method === 'E_WALLET' ? 'E_WALLET' : 'BANK';

export const CashbookAccountChoice: React.FC<{
  token: string | null; paymentMethod: CashbookPaymentMethod; value: number | null; onChange: (id: number | null) => void;
}> = ({ token, paymentMethod, value, onChange }) => {
  const { theme } = useTheme();
  const [accounts, setAccounts] = useState<FinancialAccountDto[]>([]);
  const [activated, setActivated] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void fetchCashbookSettingsApi(token).then(settings => {
      if (!active) return;
      setAccounts(settings.accounts.filter(item => item.isActive)); setActivated(Boolean(settings.activatedAt));
    }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : 'Không tải được tài khoản quỹ.'); });
    return () => { active = false; };
  }, [token]);
  const compatible = useMemo(() => accounts.filter(account => account.type === accountTypeFor(paymentMethod)), [accounts, paymentMethod]);
  const accountLabel = (account: FinancialAccountDto) => `${account.name} · ${account.code}`;
  useEffect(() => {
    if (!activated) return;
    const current = compatible.find(item => item.id === value);
    if (!current) onChange(compatible.find(item => item.isDefault)?.id ?? (paymentMethod === 'CASH' ? null : compatible[0]?.id ?? null));
  }, [activated, compatible, onChange, paymentMethod, value]);
  if (error) return <InlineAlert message={error} />;
  if (!activated) return null;
  if (!compatible.length) return <InlineAlert message={`Chưa có tài khoản ${accountTypeFor(paymentMethod) === 'CASH' ? 'tiền mặt' : accountTypeFor(paymentMethod) === 'BANK' ? 'ngân hàng' : 'ví điện tử'} đang hoạt động. Hãy cấu hình trước khi ghi nhận giao dịch.`} />;
  return <View style={{ gap: spacing.xs }}>
    <Choice label="Tài khoản nhận / chi" value={compatible.find(item => item.id === value) ? accountLabel(compatible.find(item => item.id === value)!) : 'Chọn tài khoản'} options={compatible.map(accountLabel)} onSelect={label => onChange(compatible.find(item => accountLabel(item) === label)?.id ?? null)} />
    {error ? <Text style={{ color: theme.danger, fontFamily: typography.families.body, fontSize: typography.sizes.xs }}>{error}</Text> : null}
  </View>;
};
