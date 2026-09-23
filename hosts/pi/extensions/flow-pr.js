import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import {
  directFlowPr,
  FlowPrRuntimeError,
  verifiedProjection,
} from "../../../scripts/lib/flow-pr-pi-extension.mjs";

const packagePath = (relative) =>
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../..",
    relative,
  );

const runtimePath = () => packagePath("scripts/flow-pr.mjs");
const outputContractPath = () =>
  packagePath("skills/flow-pr/references/output-contract.md");

export default function flowPrPiExtension(pi) {
  pi.registerCommand("flow-pr", {
    description:
      "Prepare a Flow PR and request one native publication confirmation",
    handler: async (args, ctx) => {
      if (
        ctx.mode !== "tui" ||
        !ctx.hasUI ||
        typeof ctx.ui?.confirm !== "function"
      ) {
        ctx.ui?.notify(
          "Flow PR requires an interactive Pi confirmation; no publication executed.",
          "error",
        );
        return;
      }
      try {
        const result = await directFlowPr(args, {
          mode: ctx.mode,
          runtimePath: runtimePath(),
          cwd: ctx.cwd,
          exec: (command, commandArgs, options) =>
            pi.exec(command, commandArgs, options),
          readFile: (file) => fs.readFile(file, "utf8"),
          writeFile: (file, content) => fs.writeFile(file, content, "utf8"),
          confirm: (title, message) => ctx.ui.confirm(title, message),
        });
        ctx.ui.notify(result.text, "info");
        const projection = verifiedProjection(result.result);
        if (projection) {
          try {
            pi.sendMessage(
              {
                customType: "flow-pr-verified",
                content: `Verified Flow PR facts: ${JSON.stringify(projection)}\nRead the packaged output contract at ${JSON.stringify(outputContractPath())} in this current turn, not a path relative to the target repository. If publication is null, suppress Jira. Otherwise emit the complete fenced copyable JIRA COMMENT only if its render gate passes; otherwise suppress it. Do not call Jira APIs, mutate Git/GitHub, infer executed checks, or request another approval.`,
                display: false,
              },
              { triggerTurn: true, deliverAs: "followUp" },
            );
          } catch {
            ctx.ui.notify(
              `${result.text} Presentation handoff failed; publication is verified.`,
              "error",
            );
          }
        }
      } catch (error) {
        if (error instanceof FlowPrRuntimeError) {
          ctx.ui.notify(error.message, "error");
        } else {
          ctx.ui.notify(
            "Flow PR stopped or outcome unknown. Inspect the repository and PR before preparing again.",
            "error",
          );
        }
      }
    },
  });
}
