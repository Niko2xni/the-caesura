import { requireSession } from '@/server/auth/guards';
import { getWasteReport, type WasteReason } from '@/server/ledger/reports';
import { WasteReportView } from '@/components/reports/waste-report-view';

interface WasteReportPageProps {
  searchParams: Promise<{
    start?: string;
    end?: string;
    reason?: string;
  }>;
}

export default async function WasteReportPage({ searchParams }: WasteReportPageProps) {
  await requireSession();

  const { start, end, reason } = await searchParams;

  const validReasons: WasteReason[] = ['expired', 'spoiled', 'damaged', 'other'];
  const parsedReason = reason && validReasons.includes(reason as WasteReason)
    ? (reason as WasteReason)
    : undefined;

  const reportData = await getWasteReport({
    startDate: start,
    endDate: end,
    reason: parsedReason,
  });

  return <WasteReportView data={reportData} />;
}
