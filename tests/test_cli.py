import json
from pathlib import Path

from typer.testing import CliRunner

from lut_builder.cli import app


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
