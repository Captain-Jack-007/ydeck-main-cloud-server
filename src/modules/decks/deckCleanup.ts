import {
  DeckJobModel,
  DeckProjectModel,
  FileModel,
  type DeckProjectDoc,
} from "../../models";

export interface CascadeDeleteResult {
  projectDeleted: number;
  jobsDeleted: number;
  filesDeleted: number;
}

export async function cascadeDeleteDeckProject(
  project: DeckProjectDoc,
): Promise<CascadeDeleteResult> {
  const projectId = project.id;
  const jobsResult = await DeckJobModel.deleteMany({ projectId });
  const filesResult = await FileModel.deleteMany({
    projectId,
    kind: { $in: ["image_asset", "deck_export"] },
  });
  const projectResult = await DeckProjectModel.deleteOne({ _id: projectId });
  return {
    projectDeleted: projectResult.deletedCount ?? 0,
    jobsDeleted: jobsResult.deletedCount ?? 0,
    filesDeleted: filesResult.deletedCount ?? 0,
  };
}
