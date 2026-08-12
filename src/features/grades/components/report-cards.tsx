import { FileText, Printer } from 'lucide-react';

import { EmptyState } from '@/shared/components/empty-state';
import { Button } from '@/shared/components/ui/button';
import { Skeleton } from '@/shared/components/ui/skeleton';
import { cn } from '@/shared/utils/cn';
import { formatPercent } from '@/shared/utils/format';

import type { ReportCard } from '../api/results.service';

/**
 * End-of-term report cards, one per pupil.
 *
 * Every percentage on the card is shown to one decimal place. They were mixed —
 * CA and exam to the whole number, the overall to a decimal — so a subject with
 * no exam yet printed "CA 78%" beside "Overall 77.5%" for what is arithmetically
 * the same figure. A parent reading two different numbers for one mark queries
 * it, and the school has to explain rounding.
 *
 * Printed with the browser rather than generated as a PDF. A school prints
 * these on headed paper in a back office on whatever machine is nearest, and
 * `window.print()` with a print stylesheet gets there with no dependency, no
 * font embedding and no server round trip. The `print:` utilities below are the
 * whole implementation: one card per page, no chrome, black on white.
 *
 * Unpublished marks are shown. This is the office's own document, produced
 * *before* publication precisely so somebody can check it — a card that
 * silently omitted a withheld mark would show a pupil as having sat fewer
 * subjects than they did, which is the exact error the check exists to catch.
 */
export function ReportCards({
  cards,
  isPending,
  schoolName,
  sessionName,
}: {
  cards: ReportCard[];
  isPending: boolean;
  schoolName: string;
  sessionName: string;
}) {
  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }, (_, index) => (
          <Skeleton key={index} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  if (cards.length === 0) {
    return (
      <EmptyState
        icon={FileText}
        title="Nobody on the roll"
        description="This class has no active enrolments for the current term."
      />
    );
  }

  const withMarks = cards.filter((card) => card.average !== null).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-[13px] text-ink-3">
          {cards.length} {cards.length === 1 ? 'pupil' : 'pupils'} · {withMarks} with marks recorded
          this term
        </p>
        <Button
          variant="secondary"
          onClick={() => {
            window.print();
          }}
        >
          <Printer className="size-4" aria-hidden />
          Print all
        </Button>
      </div>

      <div className="space-y-4">
        {cards.map((card) => (
          <article
            key={card.student_id}
            className={cn(
              'rounded-2xl border border-border bg-card p-6',
              // One card per sheet, and nothing else on the page.
              'print:break-after-page print:rounded-none print:border-0 print:bg-white print:p-0',
            )}
          >
            {/* ── Heading ────────────────────────────────────────────── */}
            <header className="border-b border-border pb-4">
              <h2 className="text-center text-lg font-extrabold tracking-tight text-ink print:text-black">
                {schoolName}
              </h2>
              <p className="text-center text-[12.5px] text-ink-3 print:text-black">
                Report card · {sessionName}
              </p>
            </header>

            <div className="grid gap-x-6 gap-y-1.5 py-4 sm:grid-cols-2">
              <Field label="Pupil" value={card.full_name} />
              <Field label="Admission number" value={card.admission_number} />
              <Field label="Class" value={card.className} />
              <Field
                label="Position"
                value={
                  card.position === null
                    ? 'Not ranked'
                    : `${ordinal(card.position)} of ${card.classSize}`
                }
              />
            </div>

            {/* ── Subjects ───────────────────────────────────────────── */}
            {card.subjects.length === 0 ? (
              <p className="py-6 text-center text-[13px] text-ink-3 print:text-black">
                No marks recorded for this pupil this term.
              </p>
            ) : (
              <table className="w-full text-left text-[13px]">
                <thead>
                  <tr className="border-y border-border">
                    <th className="py-1.5 font-semibold text-ink-3 print:text-black">Subject</th>
                    <th className="py-1.5 text-right font-semibold text-ink-3 print:text-black">
                      CA
                    </th>
                    <th className="py-1.5 text-right font-semibold text-ink-3 print:text-black">
                      Exam
                    </th>
                    <th className="py-1.5 text-right font-semibold text-ink-3 print:text-black">
                      Overall
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {card.subjects.map((subject) => (
                    <tr key={subject.subject_id}>
                      <td className="py-1.5 text-ink print:text-black">{subject.name}</td>
                      <td className="py-1.5 text-right text-ink-2 print:text-black">
                        {subject.caPercentage === null
                          ? '—'
                          : formatPercent(subject.caPercentage, 1)}
                      </td>
                      <td className="py-1.5 text-right text-ink-2 print:text-black">
                        {subject.examPercentage === null
                          ? '—'
                          : formatPercent(subject.examPercentage, 1)}
                      </td>
                      <td
                        className={cn(
                          'py-1.5 text-right font-bold print:text-black',
                          subject.overallPercentage === null
                            ? 'text-ink-3'
                            : subject.overallPercentage < 40
                              ? 'text-danger'
                              : 'text-ink',
                        )}
                      >
                        {subject.overallPercentage === null
                          ? '—'
                          : formatPercent(subject.overallPercentage, 1)}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="py-2 font-bold text-ink print:text-black" colSpan={3}>
                      Average
                    </td>
                    <td className="py-2 text-right font-extrabold text-ink print:text-black">
                      {card.average === null ? '—' : formatPercent(card.average, 1)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}

            <footer className="grid gap-6 pt-8 sm:grid-cols-2">
              <Signature label="Form teacher" />
              <Signature label="Head teacher" />
            </footer>
          </article>
        ))}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-[13px]">
      <span className="text-ink-3 print:text-black">{label}: </span>
      <span className="font-semibold text-ink print:text-black">{value}</span>
    </p>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div>
      <div className="h-8 border-b border-ink-3" />
      <p className="pt-1 text-[11.5px] text-ink-3 print:text-black">{label}</p>
    </div>
  );
}

/**
 * 1st, 2nd, 3rd — and 11th, 12th, 13th, which the naive rule gets wrong.
 */
function ordinal(value: number): string {
  const remainderHundred = value % 100;
  if (remainderHundred >= 11 && remainderHundred <= 13) return `${value}th`;

  switch (value % 10) {
    case 1:
      return `${value}st`;
    case 2:
      return `${value}nd`;
    case 3:
      return `${value}rd`;
    default:
      return `${value}th`;
  }
}
