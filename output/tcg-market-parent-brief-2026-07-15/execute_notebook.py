from __future__ import annotations

import ast
import contextlib
import io
import json
from pathlib import Path


def execute_cell(source: str, namespace: dict[str, object]) -> tuple[str, str | None]:
    tree = ast.parse(source, mode="exec")
    result_expression = None
    if tree.body and isinstance(tree.body[-1], ast.Expr):
        result_expression = ast.Expression(tree.body.pop().value)

    stdout = io.StringIO()
    with contextlib.redirect_stdout(stdout):
        if tree.body:
            exec(compile(tree, "<notebook-cell>", "exec"), namespace)
        result = eval(compile(result_expression, "<notebook-cell>", "eval"), namespace) if result_expression else None
    return stdout.getvalue(), None if result is None else repr(result)


path = Path(__file__).with_name("analysis.ipynb")
notebook = json.loads(path.read_text())
namespace: dict[str, object] = {"__name__": "__main__"}
execution_count = 0

for cell in notebook["cells"]:
    if cell["cell_type"] != "code":
        continue
    execution_count += 1
    output, result = execute_cell("".join(cell["source"]), namespace)
    cell["execution_count"] = execution_count
    cell["outputs"] = []
    if output:
        cell["outputs"].append({"name": "stdout", "output_type": "stream", "text": output.splitlines(keepends=True)})
    if result is not None:
        cell["outputs"].append(
            {
                "data": {"text/plain": result.splitlines(keepends=True)},
                "execution_count": execution_count,
                "metadata": {},
                "output_type": "execute_result",
            }
        )

path.write_text(json.dumps(notebook, indent=1) + "\n")
