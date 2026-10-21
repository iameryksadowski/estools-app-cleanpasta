use std::io::Write;
use std::process::{Command, Stdio};
fn cli(args: &[&str], input: &str) -> std::process::Output {
    let mut child = Command::new(env!("CARGO_BIN_EXE_cleanpasta")).args(args)
        .stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped()).spawn().unwrap();
    child.stdin.take().unwrap().write_all(input.as_bytes()).unwrap();
    child.wait_with_output().unwrap()
}
#[test]
fn contract() {
    for flag in ["--help", "-h", "--version", "-v"] { assert!(cli(&[flag], "").status.success()); }
    for args in [vec!["--font-size", "73"], vec!["--font-size", "-1"], vec!["--print", "xml"], vec!["--unknown"], vec!["a", "b"], vec!["--repair", "a"]] {
        assert_eq!(cli(&args, "").status.code(), Some(1), "{args:?}");
    }
    assert_eq!(cli(&["--text"], " \n").status.code(), Some(2));
    assert_eq!(cli(&["--json-input"], "[]").status.code(), Some(1));
    let result = cli(&["--md", "--body", "--font-size", "0", "--print", "json"], "---\ntitle: Test\n---\n**Hi**\n---\nnotes");
    assert!(result.status.success());
    let value: serde_json::Value = serde_json::from_slice(&result.stdout).unwrap();
    assert_eq!(value["html"], "<div><b>Hi</b></div>");
    assert_eq!(value["text"], "Hi\n");
    assert_eq!(String::from_utf8(cli(&["--print", "text", "--font-size", "0"], "- one\n- two").stdout).unwrap(), "- one\n- two\n");
}
#[test]
fn file_types() {
    let dir = std::env::temp_dir().join(format!("cleanpasta-cli-test-{}", std::process::id()));
    std::fs::create_dir_all(&dir).unwrap();
    for (name, source, html) in [("a.md", "**Hi**", "<div><b>Hi</b></div>"), ("a.html", "<p style='color:red'><i>x</i></p>", "<div><i>x</i></div>")] {
        let file = dir.join(name);
        std::fs::write(&file, source).unwrap();
        let result = cli(&[file.to_str().unwrap(), "--font-size", "0"], "");
        assert!(result.status.success());
        assert_eq!(String::from_utf8(result.stdout).unwrap().trim(), html);
    }
    std::fs::remove_dir_all(dir).unwrap();
}
