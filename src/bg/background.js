const classesUrl = 'https://assignments.onenote.com/api/v1.0/edu/me/classes';

// Local storage
const adalKey = "adal.access.token.keyhttps://onenote.com/";
const adalExp = "adal.expiration.keyhttps://onenote.com/";

let report_window = null;

// function getCookies(domain, name, callback) {
//     chrome.cookies.get({ "url": domain, "name": name }, function(cookie) {
//         if (callback) {
//             callback(cookie);
//         }
//     });
// }

// Note that response.statusText will often be empty because
// HTTP/2 does not define a way to carry the version or reason
// phrase that is included in an HTTP/1.1 status line.
const parseAPIResponse = response =>
    new Promise(resolve => resolve(response.text()))
    .catch(err =>
        // eslint-disable-next-line prefer-promise-reject-errors
        Promise.reject({
            type: 'NetworkError',
            status: response.status,
            message: err,
            url: response.url,
        }))
    .then((responseBody) => {

        if (!response.ok) {
            return Promise.reject({
                type: 'HttpError',
                status: response.status,
                body: responseBody,
                url: response.url,
            });
        }

        // Attempt to parse JSON
        try {
            const parsedJSON = JSON.parse(responseBody);
            if (response.ok) {
                return parsedJSON;
            } else {
                return Promise.reject({
                    type: 'HttpError',
                    status: response.status,
                    body: responseBody,
                    url: response.url,
                });
            }
        } catch (e) {
            // If we got an HTML page, truncate it.
            let body = response.statusText.substr(0, 500);

            // We should never get these unless response is mangled
            // Or API is not properly implemented
            // eslint-disable-next-line prefer-promise-reject-errors
            return Promise.reject({
                type: 'InvalidJSON',
                status: response.status,
                body: body,
                url: response.url,
            });
        }
    });

async function do_fetch(url, headers) {
    const json = await fetch(url, { headers: headers })
        .then(parseAPIResponse);
    //.catch(err => alert(JSON.stringify(err, null, 4)));
}

async function do_fetch_with_bearer(url, bearer) {

    const headers = {
        'Content-Type': 'application/json',
        Authorization: "Bearer " + bearer,
        Accept: 'application/json',
        credentials: "include"
    };

    const json = await fetch(url, { headers: headers })
        .then(parseAPIResponse);
    //.catch(err => alert(JSON.stringify(err, null, 4)));
    return json;
}

async function fetch_classes(bearer) {
    return await do_fetch_with_bearer(classesUrl, bearer);
}

function make_url(classes, i) {
    let oneclass = classes[i];
    return "https://assignments.onenote.com//api/v1.0/edu/classes/" + oneclass.id +
        "/assignments?$select=classId,displayName,dueDateTime,assignedDateTime,allowLateSubmissions,createdDateTime,lastModifiedDateTime,status,statusreason,isCompleted,id,instructions,grading,submissions&$expand=submissions";
}

async function fetch_all_with_bearer(bearer, classes) {

    const indices = Array.from({ length: classes.length }, (x, i) => i);
    //const indices = [4, 5];

    let mapper = {};
    for (let i = 0; i < indices.length; i++) {
        mapper[classes[i].id] = classes[i].displayName;
    }

    let jsons = {};
    let promises = [];

    for (let i = 0; i < indices.length; i++) {
        const index = indices[i];
        const classname = classes[index].name;
        const promise = do_fetch_with_bearer(make_url(classes, index), bearer)
            .then(result => {
                jsons[classname] = result.value;
                for (let i = 0; i < promises.length; i++) {
                    if (promises[i] === promise) {
                        promises.splice(i, 1);
                        break;
                    }
                }
            });
        promises.push(promise);

        // Once we hit our concurrency limit, wait for a promise to resolve
        // before continuing so as to cap the number of outstanding requests.
        if (promises.length >= 4) {
            await Promise.race(promises);
        }
    }

    await Promise.all([...promises]);

    return jsons;
}


function get_assignments(classes) {
    let info = [];
    for (oneclass of classes) {
        assignments = read_assignments(oneclass.id);
        info[oneclass.name] = assignments.value;
        break;
    }
    return info;
}

function missing_submission(submissions) {
    if (submissions == null) return false;
    for (let i = 0; i < submissions.length; i++) {
        let sub = submissions[i];
        if (sub.status != "returned" && sub.submittedDateTime === null)
            return true;
    }
    return false;
}

function has_rework(submissions) {
    if (submissions == null) return false;
    for (let i = 0; i < submissions.length; i++) {
        let sub = submissions[i];
        if (sub.status == "returned" && sub.submittedDateTime === null)
            return true;
    }
    return false;
}

function get_latest(coll, key) {
    if (coll == null) return "";
    let latest = "";
    for (let i = 0; i < coll.length; i++) {
        if (coll[i][key] > latest) {
            latest = coll[i][key];
        }
    }
    return latest;
}

function create_row(classname, assignment) {
    row = {
        id: assignment.id,
        lastModifiedDateTime: assignment.lastModifiedDateTime,
        createdDateTime: assignment.createdDateTime,
        classname: classname,
        dueDateTime: assignment.dueDateTime,
        submittedDateTime: get_latest(assignment.submissions, "submittedDateTime"),
        name: assignment.displayName,
        points: assignment.grading ? assignment.grading.maxPoints : null,
        missingSubmission: missing_submission(assignment.submissions),
        rework: has_rework(assignment.submissions),
        completed: assignment.isCompleted
    };
    return row;
}

function create_rows_from_class_map(object) {
    const rows = [];
    for (var classname of Object.keys(object)) {
        const assignments = object[classname];
        for (let i = 0; i < assignments.length; i++) {
            let row = create_row(classname, assignments[i]);
            rows.push(row);
        }
    }
    return rows;
}

// For testing
function index_assignments(assignments) {
    let coll = {};
    for (let i = 0; i < assignments.length; i++) {
        let assignment = assignments[i];
        coll[assignment.id] = assignment;
    }
    return coll;
}

function create_window() {
    chrome.windows.create({
        // Just use the full URL if you need to open an external page
        url: chrome.runtime.getURL("page_action/page_action.html")
    }, wnd => report_window = wnd);
}

async function build(pair) {
    if (report_window == null) {
        create_window();
    } else {
        // chrome.tabs.getAllInWindow(report_window.id, function (tabs) {
        //     if (chrome.extension.lastError != null) {
        //         create_window();
        //     }
        // });
        chrome.tabs.update(report_window.tabs[0].id, {highlighted: true}, function (e) {
            if (chrome.extension.lastError != null) {
                create_window();
            }
        });
    }

    if (pair == null || pair.length != 1 || pair[0].length != 2) {
        console.log("Remote code failed");
        return;
    }

    let neterror = null;

    const bearer = pair[0][0];

    // We don't use the expired information we got from storage because
    // (I think?) the time could be far enough off to cause problems.
    // const exp = pair[0][1];
    // const now = new Date() / 1000;


    let classes = await fetch_classes(bearer)
        .catch(err => neterror = err);

    let jsons = null;
    if (neterror == null) {
        jsons = await fetch_all_with_bearer(bearer, classes.value)
            .catch(err => neterror = err);
    }

    if (neterror instanceof Error) {
        neterror = {
            type: 'NetworkError',
            status: 0,
            message: neterror.message,
            url: "",
        };
    }

    let kv = null;
    if (neterror == null) {
        coll = create_rows_from_class_map(jsons);
        //console.log(JSON.stringify(coll, null, 4));
        const now = new Date();
        kv = { data: { rows: coll, updated: now.toISOString() } };
    } else {
        kv = { error: neterror };
    }

    chrome.storage.local.set(kv, function() {
    });
}

function generate_report() {
    // TODO: Check the expiration time in "exp"
    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        const tab = tabs[0];
        // Execute script in the current tab
        chrome.tabs.executeScript(tab.id, { code: `[ localStorage['${adalKey}'], localStorage['${adalExp}'] ]` }, build);
    });
}

// Check for chrome so as to allow unit tests.
if (!!chrome.runtime) {
    // https://developer.chrome.com/extensions/getstarted
    chrome.runtime.onInstalled.addListener(function() {

        chrome.pageAction.onClicked.addListener(function(tab) {
            chrome.storage.local.remove("error", function() {
                chrome.storage.local.remove("data", function() {
                    generate_report();
                });
            });
        });

        // https://assignments.onenote.com/sections/classroom
        chrome.declarativeContent.onPageChanged.removeRules(undefined, function() {
            chrome.declarativeContent.onPageChanged.addRules([{
                conditions: [
                    new chrome.declarativeContent.PageStateMatcher({
                        pageUrl: { hostEquals: "teams.microsoft.com" }
                        // This doesn't work:
                        //pageUrl: { hostEquals: "teams.microsoft.com", pathSuffix: "sections/classroom" }
                    })
                ],
                actions: [new chrome.declarativeContent.ShowPageAction()]
            }]);
        });

    });
}