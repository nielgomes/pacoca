import fs from "fs";
import path from "path";
import { z } from "zod";
import getHomeDir from "./getHomeDir";

const SummaryDataSchema = z.object({
  summary: z.string(),
  opinions: z.array(
    z.object({
      name: z.string(),
      jid: z.string(),
      opinion: z.number(),
      traits: z.array(z.string()),
    })
  ),
});

const DataStoreSchema = z.object({
  groups: z.record(SummaryDataSchema),
});

const LegacySchema = SummaryDataSchema;

export type SummaryData = z.infer<typeof SummaryDataSchema>;
export type DataStore = z.infer<typeof DataStoreSchema>;

export default function database() {
  const file = path.join(getHomeDir(), "database", "data.json");
  const directory = path.dirname(file);

  if (!fs.existsSync(directory)) {
    fs.mkdirSync(directory, { recursive: true });
  }

  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, JSON.stringify({ groups: {} }, null, 2));
  }

  try {
    const rawData = fs.readFileSync(file, "utf-8");
    const data = JSON.parse(rawData);

    let parsedData: DataStore;

    try {
      parsedData = DataStoreSchema.parse(data);
    } catch (error) {
      const legacyData = LegacySchema.parse(data);
      parsedData = { groups: { legacy: legacyData } };
    }

    const mapData = new Map<string, SummaryData>(
      Object.entries(parsedData.groups || {})
    );

    function setGroup(groupId: string, value: SummaryData) {
      mapData.set(groupId, value);
    }

    function getGroup(groupId: string): SummaryData {
      return (
        mapData.get(groupId) || {
          summary: "",
          opinions: [],
        }
      );
    }

    function hasGroup(groupId: string): boolean {
      return mapData.has(groupId);
    }

    function getAllGroups(): Record<string, SummaryData> {
      return Object.fromEntries(mapData) as Record<string, SummaryData>;
    }

    function save() {
      const dataToSave = { groups: Object.fromEntries(mapData) };
      const isValid = DataStoreSchema.safeParse(dataToSave);

      if (!isValid.success) {
        throw new Error("Data validation failed: " + JSON.stringify(isValid.error.errors));
      }

      fs.writeFileSync(file, JSON.stringify(dataToSave, null, 2));
    }

    return {
      setGroup,
      getGroup,
      hasGroup,
      getAllGroups,
      save,
    };
  } catch (error) {
    const validData = { groups: {} };

    fs.writeFileSync(file, JSON.stringify(validData, null, 2));
    return database();
  }
}
