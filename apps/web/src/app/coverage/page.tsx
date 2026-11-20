import { CoverageWorkspace, type CoverageQuery } from '@/components/coverage/coverage-workspace';

export default async function CoveragePage({ searchParams }: { searchParams: Promise<CoverageQuery> }) {
  return <CoverageWorkspace search={await searchParams} />;
}
