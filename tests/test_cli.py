import json
from pathlib import Path

from typer.testing import CliRunner

from lut_builder.cli import BACK, app, numbered_choice, pick_width


def test_prompt_back_sentinel_and_selection(monkeypatch):
    answers = iter(["0", "0", "1"])
    monkeypatch.setattr("lut_builder.cli.Prompt.ask", lambda *args: next(answers))
    assert pick_width() is BACK
    assert numbered_choice("Select", ["17"], allow_back=True) is BACK
    assert numbered_choice("Select", ["17"], allow_back=True) == "17"


def test_bare_output_filename_uses_default_lut_folder(tmp_path, monkeypatch):
    config = tmp_path / "setup.json"
    config.write_text(
        json.dumps(
            {
                "version": 2,
                "profile": "Panasonic V-Log",
                "target": "Rec.709",
                "cube_size": 17,
                "output": "test_new_panasonic.cube",
            }
        )
    )
    generated = []

    def capture_output(setup):
        generated.append(setup.output_filename)
        return Path(setup.output_filename)

    monkeypatch.chdir(tmp_path)
    monkeypatch.setattr("lut_builder.cli.generate_lut", capture_output)

    result = CliRunner().invoke(app, ["build", "--config", str(config)])

    assert result.exit_code == 0
    assert generated == [str(Path("output/luts/test_new_panasonic.cube"))]


def test_workspace_command_launches_local_app(monkeypatch):
    launched = []
    monkeypatch.setattr(
        "lut_builder.web.launch_workspace", lambda: launched.append(True)
    )

    result = CliRunner().invoke(app, ["workspace"])

    assert result.exit_code == 0
    assert launched == [True]
