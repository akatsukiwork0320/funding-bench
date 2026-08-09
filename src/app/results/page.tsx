import { getFunders, getGroundTruth, getProposals } from "@/lib/data";
import ResultsClient from "./results-client";

export default function ResultsPage() {
  return (
    <ResultsClient
      proposals={getProposals()}
      groundTruth={getGroundTruth()}
      funders={getFunders()}
    />
  );
}
