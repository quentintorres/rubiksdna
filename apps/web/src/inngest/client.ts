import { EventSchemas, Inngest } from "inngest";

type Events = {
  "statemap/file.uploaded": {
    data: {
      orgId: string;
      fileId: string;
      sampleId: string;
      kind: "beta_matrix" | "chem_panel";
    };
  };
  "statemap/sample.processed": {
    data: { orgId: string; sampleId: string };
  };
  "statemap/episode.created": {
    data: { orgId: string; episodeId: string };
  };
  "statemap/report.issued": {
    data: { orgId: string; reportId: string };
  };
  "statemap/export.requested": {
    data: { orgId: string; requestedBy: string };
  };
};

export const inngest = new Inngest({
  id: "rubiksdna-statemap",
  schemas: new EventSchemas().fromRecord<Events>(),
});
