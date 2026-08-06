import { useEffect, useState } from 'react';
import { FileUp } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/shared/components/ui/alert';
import { Button } from '@/shared/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/components/ui/dialog';
import { Input } from '@/shared/components/ui/input';
import { Label } from '@/shared/components/ui/label';
import { Select } from '@/shared/components/ui/select';
import type { Grade } from '@/shared/types';

import { parseGradeCsv, type ImportRow } from '../api/grades.service';
import { useGradeMutations } from '../hooks/use-gradebook';

/**
 * Import marks from a two-column CSV: admission number, score.
 *
 * The file is parsed and shown back before anything is written. A gradebook
 * import is the one operation in the product that can quietly put a mark
 * against the wrong child — so nothing is saved until the teacher has seen how
 * many rows matched the register and which did not.
 */

const ASSESSMENT_TYPES = [
  { value: 'test', label: 'Test' },
  { value: 'exam', label: 'Exam' },
  { value: 'classwork', label: 'Classwork' },
  { value: 'homework', label: 'Homework' },
  { value: 'project', label: 'Project' },
];

export function GradeImportDialog({
  open,
  onOpenChange,
  classId,
  subjectId,
  schoolId,
  sessionId,
  roster,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classId: string;
  subjectId: string;
  schoolId: string;
  sessionId: string;
  roster: { student_id: string; admission_number: string }[];
}) {
  const { importCsv } = useGradeMutations();

  const [title, setTitle] = useState('');
  const [assessmentType, setAssessmentType] = useState('test');
  const [maxScore, setMaxScore] = useState('100');
  const [weightPercent, setWeightPercent] = useState('100');
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [fileName, setFileName] = useState('');

  useEffect(() => {
    if (!open) return;
    importCsv.reset();
    setTitle('');
    setAssessmentType('test');
    setMaxScore('100');
    setWeightPercent('100');
    setRows([]);
    setProblems([]);
    setFileName('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const known = new Set(roster.map((row) => row.admission_number));
  const matched = rows.filter((row) => known.has(row.admissionNumber));
  const unmatched = rows.filter((row) => !known.has(row.admissionNumber));

  const readFile = (file: File | undefined) => {
    if (!file) return;
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = () => {
      // `readAsText` always produces a string, but the DOM types allow an
      // ArrayBuffer. Narrowing beats String()-ing one into "[object …]".
      const text = typeof reader.result === 'string' ? reader.result : '';
      const parsed = parseGradeCsv(text, Number(maxScore) || 100);
      setRows(parsed.rows);
      setProblems(parsed.problems);
    };
    reader.readAsText(file);
  };

  const canImport = matched.length > 0 && title.trim().length > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Import marks</DialogTitle>
          <DialogDescription>
            A CSV with two columns: admission number, then score. A header row is optional.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <div className="space-y-1.5">
              <Label htmlFor="gi-title">Assessment name</Label>
              <Input
                id="gi-title"
                value={title}
                onChange={(event) => {
                  setTitle(event.target.value);
                }}
                placeholder="Mid-term test"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gi-type">Kind</Label>
              <Select
                id="gi-type"
                value={assessmentType}
                onChange={(event) => {
                  setAssessmentType(event.target.value);
                }}
                options={ASSESSMENT_TYPES}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="gi-max">Out of</Label>
              <Input
                id="gi-max"
                type="number"
                min={1}
                value={maxScore}
                onChange={(event) => {
                  setMaxScore(event.target.value);
                }}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="gi-weight">Weight (%)</Label>
              <Input
                id="gi-weight"
                type="number"
                min={0}
                max={100}
                value={weightPercent}
                onChange={(event) => {
                  setWeightPercent(event.target.value);
                }}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="gi-file">File</Label>
            <Input
              id="gi-file"
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                readFile(event.target.files?.[0]);
              }}
            />
            {fileName ? <p className="text-[12px] text-ink-3">{fileName}</p> : null}
          </div>

          {rows.length > 0 || problems.length > 0 ? (
            <Alert variant={unmatched.length > 0 || problems.length > 0 ? 'warning' : 'success'}>
              <FileUp aria-hidden />
              <AlertTitle>
                {matched.length} of {rows.length} rows match this register
              </AlertTitle>
              <AlertDescription>
                {unmatched.length > 0 ? (
                  <p>
                    Not on the register:{' '}
                    {unmatched
                      .slice(0, 5)
                      .map((row) => row.admissionNumber)
                      .join(', ')}
                    {unmatched.length > 5 ? ` and ${unmatched.length - 5} more` : ''}. These are
                    skipped.
                  </p>
                ) : null}
                {problems.slice(0, 4).map((problem) => (
                  <p key={problem}>{problem}</p>
                ))}
                {problems.length > 4 ? <p>and {problems.length - 4} more.</p> : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <p className="text-[12px] text-ink-3">
            Imported marks are saved unpublished. Nothing is visible to pupils until you publish
            from the gradebook.
          </p>
        </DialogBody>

        <DialogFooter>
          <Button
            type="button"
            variant="secondary"
            onClick={() => {
              onOpenChange(false);
            }}
            disabled={importCsv.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!canImport}
            loading={importCsv.isPending}
            onClick={() => {
              importCsv.mutate(
                {
                  rows: matched,
                  roster,
                  schoolId,
                  classId,
                  subjectId,
                  sessionId,
                  title: title.trim(),
                  assessmentType: assessmentType as Grade['assessment_type'],
                  maxScore: Number(maxScore) || 100,
                  weight: Math.min(1, Math.max(0, Number(weightPercent) / 100)),
                },
                {
                  onSuccess: () => {
                    onOpenChange(false);
                  },
                },
              );
            }}
          >
            Import {matched.length > 0 ? matched.length : ''} marks
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
