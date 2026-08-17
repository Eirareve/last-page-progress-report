import type { z } from "zod";

import type { charlieFinalLetterSchema } from "../schemas/final-letter.schema";

export type CharlieFinalLetter = z.infer<typeof charlieFinalLetterSchema>;
