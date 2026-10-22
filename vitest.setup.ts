import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.INNO_DATA_DIR = join(tmpdir(), `inno-agent-vitest-${process.pid}`);
