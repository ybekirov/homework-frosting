const forTodayButton = document.getElementById("forTodayButton");
const forLateButton = document.getElementById("forLateButton");

const extractCopyText = text =>
    text
    .split("\n")
    // Get rid of new lines
    .filter(_ => _.replace(/\s+/g, ""))
    .map(c => c.trim())
    .join("\n");

const copyToClipboard = code =>
    navigator.clipboard
    .writeText(code)
    .then(() => alert("Copied to clipboard~"))
    .catch(() => alert("Failed to copy to clipboard..."));
// This function expects an HTML string and copies it as rich text.

function copyFormatted(html) {
    // Create container for the HTML
    // [1]
    var container = document.createElement('div')
    container.innerHTML = html

    // Hide element
    // [2]
    container.style.position = 'fixed'
    container.style.pointerEvents = 'none'
    container.style.opacity = 0

    // Detect all style sheets of the page
    var activeSheets = Array.prototype.slice.call(document.styleSheets)
        .filter(function(sheet) {
            return !sheet.disabled
        })

    // Mount the container to the DOM to make `contentWindow` available
    // [3]
    document.body.appendChild(container)

    // Copy to clipboard
    // [4]
    window.getSelection().removeAllRanges()

    var range = document.createRange()
    range.selectNode(container)
    window.getSelection().addRange(range)

    // [5.1]
    document.execCommand('copy')

    // [5.2]
    for (var i = 0; i < activeSheets.length; i++) activeSheets[i].disabled = true

    // [5.3]
    document.execCommand('copy')

    // [5.4]
    for (var i = 0; i < activeSheets.length; i++) activeSheets[i].disabled = false

    // Remove the container
    // [6]
    document.body.removeChild(container)
}

document.getElementById("copyButton").addEventListener("click", _ => {
    const forToday = document.getElementById("copyme");
    //const code = extractCopyText(forToday.innerHtml);
    copyFormatted(forToday.innerHTML);
});

function generateTableHead(table, data) {
    let thead = table.createTHead();
    let row = thead.insertRow();
    for (let key of data) {
        let th = document.createElement("th");
        let text = document.createTextNode(key);
        th.appendChild(text);
        row.appendChild(th);
    }
}

function CreateTableFromJSON(doc, myBooks, col, id) {

    // EXTRACT VALUE FOR HTML HEADER.
    // ('Book ID', 'Book Name', 'Category' and 'Price')
    if (col == null || col.length == 0) {
        col = [];
        for (var i = 0; i < myBooks.length; i++) {
            for (var key in myBooks[i]) {
                if (col.indexOf(key) === -1) {
                    col.push(key);
                }
            }
        }
    }

    // CREATE DYNAMIC TABLE.
    var table = doc.createElement("table");

    // CREATE HTML TABLE HEADER ROW USING THE EXTRACTED HEADERS ABOVE.

    // ADD JSON DATA TO THE TABLE AS ROWS.
    for (var i = 0; i < myBooks.length; i++) {

        tr = table.insertRow();

        for (let j = 0; j < col.length; j++) {
            let tabCell = tr.insertCell(-1);
            if (col[j] in myBooks[i]) {
                data = myBooks[i][col[j]];
                if (data === false) data = "-";
                if (data === true) date = "<b>&#x2713;</b>";

                tabCell.innerHTML = data;
            }
        }
    }

    // Must do this last to get a tbody section
    generateTableHead(table, col);

    // FINALLY ADD THE NEWLY CREATED TABLE WITH JSON DATA TO A CONTAINER.
    var divContainer = doc.getElementById(id);
    divContainer.innerHTML = "";
    divContainer.appendChild(table);
}

// Reverse sort
function compareSubmittedDateTime(a, b) {
    let bandA = "";
    let bandB = "";

    if ("submittedDateTime" in a) bandA = a.submittedDateTime;
    if ("submittedDateTime" in b) bandB = b.submittedDateTime;

    let comparison = 0;
    if (bandA < bandB) {
        comparison = 1;
    } else if (bandA > bandB) {
        comparison = -1;
    }
    return comparison;
}

function compareDueDateTime(a, b) {
    let bandA = "";
    let bandB = "";

    if ("dueDateTime" in a) bandA = a.dueDateTime;
    if ("dueDateTime" in b) bandB = b.dueDateTime;

    let comparison = 0;
    if (bandA > bandB) {
        comparison = 1;
    } else if (bandA < bandB) {
        comparison = -1;
    }
    return comparison;
}

// dt1 and dt2 are both iso date strings
function hoursDiff(dt1, dt2) {
    let d1 = new Date(dt1);
    let d2 = new Date(dt2);

    let diffTime = (d2.getTime() - d1.getTime());
    return diffTime / (1000 * 3600);
}

function daysDiff(dt1, dt2) {
    // calculate the time difference of two dates JavaScript
    let diffTime = (dt2.getTime() - dt1.getTime());
    // calculate the number of days between two dates javascript
    let daysDiff = diffTime / (1000 * 3600 * 24);
    return daysDiff;
}

// If any of the words in `filters` appears in item.name,
// then this is skipped.
function is_skipped(name, filters) {
    for (let i=0; i<filters.length; i++) {
        if (name.toLowerCase().indexOf(filters[i].toLowerCase()) != -1) {
            return true;
        }
    }
    return false;
}

function is_today(iso, today) {
    const someDate = new Date(iso);
    if (today == null) today = new Date();
    return someDate.getDate() == today.getDate() &&
        someDate.getMonth() == today.getMonth() &&
        someDate.getFullYear() == today.getFullYear();
}

function render(rows, updated, filter) {
    const nowIso = new Date().toISOString();

    for (let i = 0; i < rows.length; i++) {
        let el = rows[i];
        el.name = "<b>" + el.name + "</b>";
        el.today = is_today(el.dueDateTime);
        el.late = el.dueDateTime < nowIso && (!el.completed || el.missingSubmission);
        el.due = dateFormat(new Date(el.dueDateTime), "ddd, mmm dS, h:MM TT")
        el.submitted = el.submittedDateTime != "" ? dateFormat(new Date(el.submittedDateTime), "ddd, mmm dS, h:MM TT") : "";
        if ("rework" in el) {
            if (el.rework) {
                el.today = true;
                el.due = "(corrections)";
                el.completed = false;
            }
        }
        if (el.completed && hoursDiff(el.submittedDateTime, updated) < 24) {
            el.submitted += " &#11088;";
        }
    }

    let el = document.getElementById("updated");
    el.innerText = dateFormat(new Date(updated), "ddd, mmm dS, yyyy, h:MM TT");

    rows = rows.sort(compareDueDateTime);

    // TODO Issue #
    const filters = filter.split("\n");
    rows = rows.filter((item) => !is_skipped(item.name + " " + item.classname, filters));

    let headings = ["classname", "name", "due", "points"];

    var wanted = rows.filter((item) => item.today);
    CreateTableFromJSON(document, wanted, headings, "forToday");

    wanted = rows.filter((item) => item.late);
    CreateTableFromJSON(document, wanted, headings, "forLate");

    wanted = rows.filter((item) => !item.completed && !item.late && !item.today);
    CreateTableFromJSON(document, wanted, headings, "forUpcoming");

    headings = ["classname", "name", "submitted", "points"];
    wanted = rows.filter((item) => item.completed && !item.late).sort(compareSubmittedDateTime);;
    CreateTableFromJSON(document, wanted, headings, "forCompleted");
}

async function render_table_from_storage() {
    chrome.storage.local.get("data", function(local) {
        chrome.storage.sync.get("options", function(obj) {
            let filter = "";
            let options = obj.options;
            if (options != null && options.filter != null) filter = options.filter;
            render(local.data.rows, local.data.updated, filter);
        });
    });
}

render_table_from_storage();

// let rows = obj.rows;

// rows.sort(compare);
// render(obj.rows);