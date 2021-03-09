'use strict';
const { exec } = require('child_process');
const { ESLint } = require('eslint');

const errors = {
    GENERAL_ERROR          : 1,
    COMMAND_CANNOT_EXECUTE : 126,
};

/*
    THIS SHOULD ONLY EVER BE ONE FILE, `scripts/pre-commit.js`
*/
const ignored_files = [
    'scripts/pre-commit.js'
];

function os_run(cmd) {
    return new Promise(
        (res, rej) => {
            exec(
                cmd,
                (error, stdout, stderr) => {
                    if (error) {
                        let ret = { error: error, stderr: null };
                        let err_message = `failed to execute cmd: ${cmd}, error: ${error.message}`;
                        console.log(`failed to execute cmd: ${cmd}, error: ${error.message}`);
                        if (stderr) {
                            ret.stderr = stderr;
                            err_message += ` with stderr: ${stderr}`;
                        }
                        console.log(err_message);
                        rej(ret);
                    } else if (stdout) {
                        res({success: true, stdout: stdout});
                    } else if (stderr) {
                        let ret = { error: 'UNKNOWN_ERROR', stderr: null };
                        let err_message = `unknown error when executing cmd: ${cmd}`;
                        err_message += ` with stderr: ${stderr}`;
                        ret.stderr = stderr;
                        console.log(err_message);
                        rej(ret);
                    } else {
                        res({success: true, stdout: null});
                    }
                }
            );
            return null;
        }
    );
}

module.exports = async function() {
    // we only want to find files that have changed, are staged for commit
    // disable pager for git, as that redirects output away from stdout
    let response = await os_run(`git --no-pager diff --cached --name-only`);

    // throw an error if we found an error
    if (response.error) {
        if (response.error === 'UNKNOWN_ERROR') {
            throw errors.GENERAL_ERROR;
        } else {
            throw errors.COMMAND_CANNOT_EXECUTE;
        }
    }

    // return 0, nothing to do
    // if stdout is empty, that means there are no files changed and cached
    // cached files in git means files ready to be committed
    if (response.success && response.stdout === null) {
        return 0;
    }


    if (response.success && response.stdout) {
        // windows uses `\r\n` for new lines, all other systems use `\n`
        // `process.platform` return `win32` for all versions of windows
        let new_line = process.platform === 'win32' ? '\r\n' : '\n';
        // stdout from a `git diff --name-only` will return a string, with escaped
        // new lines, i.e. `file_1\nfile_2\n`, and there might be a final new line
        // we want to get a list of changed files, so we split on new line
        // filter because `file_1\nfile_2\n`.split('\n') => ['file_1', 'file_2', '']
        // we also want to filter out files that aren't `js, jsx, ts, tsx`
        // we also want to filter out ignored files
        let changed_files = response.stdout.split(new_line).filter(
            cf => cf.length && (/(t|j)sx?$/g).test(cf) && !ignored_files.includes(cf)
        );

        if (changed_files.length) {
            try {
                const eslint = new ESLint();
                const results = await eslint.lintFiles(changed_files);
                const formatter = await eslint.loadFormatter('stylish');
                const prettyResults = formatter.format(results);
                console.log(prettyResults);
                if (
                    results.errorCount === 0 &&
                    results.warningCount === 0 &&
                    results.fixableErrorCount == 0 &&
                    results.fixableWarningCount === 0
                ) {
                    return 0;
                } else {
                    console.log('LINTING ERRORS');
                    throw errors.GENERAL_ERROR;
                }
            } catch (eslint_error) {
                console.log('Failed to run ESLint, error: ', eslint_error);
                throw errors.COMMAND_CANNOT_EXECUTE;
            }
        } else {
            return 0;
        }
    }

    // if we somehow dont return and end up here, we have some general error
    // since we must either throw errors.* if response.error
    // or we return `0` if response.success && response.stdout === null
    // or we handle changed files in the final if block
    // throw general error
    throw errors.GENERAL_ERROR;
}

// main().then(
//     (res) => {
//         console.log(res);
//     }
// ).catch(
//     (err) => {
//         process.exitCode = err;
//         return err;
//     }
// );
