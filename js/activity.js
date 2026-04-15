// Find TODO statements and complete them to build the interactive airline route map.

const dataFile = await d3.csv("data/routes.csv");
const colornone = "#ccc";

// define colors for airlines, you can expand this as needed, WN is Southwest, B6 is JetBlue
const airlineColor = { WN: "orange", B6: "steelblue" };
const airlineName = { WN: "Southwest Airlines", B6: "JetBlue" };
const fallbackAirlineColor = d3.scaleOrdinal()
    .domain([...new Set(dataFile.map(d => d.Airline))])
    .range(d3.schemeTableau10);

// create options from selector that allows us to view all airlines or filter by a specific airline
const airlines = ["all", ...new Set(dataFile.map(d => d.Airline))];

// build selector from data
const select = d3.select("body")
    .insert("select", "#chart")
    .on("change", function () { draw(this.value); });

select.selectAll("option")
    .data(airlines)
    .join("option")
    .attr("value", d => d)
    .text(d => d === "all" ? "All airlines" : (airlineName[d] || d));

// helper function to build outgoing and incoming links for each leaf node
function bilink(root) {
    const map = new Map(root.leaves().map(d => [id(d), d]));

    for (const d of root.leaves()) {
        d.incoming = [];
    }

    for (const d of root.leaves()) {
        d.outgoing = d.data.destinations
            .map(({ target, airline, targetRegion }) => [d, map.get(`root/${targetRegion}/${target}`), airline])
            .filter(([, target]) => target !== undefined);

        for (const link of d.outgoing) {
            link[1].incoming.push(link);
        }
    }

    return root;
}

// helper function to generate a unique ID for each node based on its position in the hierarchy
function id(node) {
    return `${node.parent ? id(node.parent) + "/" : ""}${node.data.name}`;
}

// rebuild hierarchy data and redraw chart on selection change
function draw(airlineFilter) {
    const filtered = airlineFilter === "all"
        ? dataFile
        : dataFile.filter(d => d.Airline === airlineFilter);

    const airportsByRegion = d3.group(
        filtered.flatMap(d => [
            { region: d["Source region"], airport: d["Source airport"] },
            { region: d["Destination region"], airport: d["Destination airport"] }
        ]),
        d => d.region
    );

    const routesBySource = d3.group(filtered, d => d["Source region"], d => d["Source airport"]);

    const hierarchyData = {
        name: "root",
        children: Array.from(airportsByRegion, ([region, values]) => ({
            name: region,
            children: Array.from(new Set(values.map(d => d.airport)), airport => ({
                name: airport,
                destinations: (routesBySource.get(region)?.get(airport) || []).map(r => ({
                    target: r["Destination airport"],
                    airline: r.Airline,
                    targetRegion: r["Destination region"]
                }))
            })).sort((a, b) => d3.ascending(a.name, b.name))
        })).sort((a, b) => d3.ascending(a.name, b.name))
    };

    document.getElementById("chart").innerHTML = "";
    document.getElementById("chart").appendChild(createChart(hierarchyData));
}

draw("all");

// Adapted from the Observable hierarchical edge bundling example
function createChart(data) {
    const width = 1100;
    const radius = width / 2;

    const tree = d3.cluster()
        .size([2 * Math.PI, radius - 140]);

    const line = d3.lineRadial()
        .curve(d3.curveBundle.beta(0.85))
        .radius(d => d.y)
        .angle(d => d.x);

    const root = tree(
        bilink(
            d3.hierarchy(data)
                .sort((a, b) => d3.ascending(a.height, b.height) || d3.ascending(a.data.name, b.data.name))
        )
    );

    const svg = d3.create("svg")
        .attr("viewBox", [-width / 2, -width / 2, width, width])
        .attr("width", width)
        .attr("height", width)
        .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

    const link = svg.append("g")
        .attr("fill", "none")
        .attr("stroke", colornone)
        .attr("stroke-opacity", 0.55)
        .selectAll("path")
        .data(root.leaves().flatMap(leaf => leaf.outgoing))
        .join("path")
        .style("mix-blend-mode", "multiply")
        .attr("d", ([source, target]) => line(source.path(target)))
        .attr("stroke", ([, , airline]) => airlineColor[airline] || fallbackAirlineColor(airline))
        .each(function (d) {
            d.path = this;
        });

    const node = svg.append("g")
        .selectAll("text")
        .data(root.leaves())
        .join("text")
        .attr("dy", "0.31em")
        .attr("transform", d => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y + 8},0)${d.x < Math.PI ? "" : " rotate(180)"}`)
        .attr("text-anchor", d => d.x < Math.PI ? "start" : "end")
        .attr("fill", "#222")
        .text(d => d.data.name)
        .each(function (d) {
            d.text = this;
        })
        .on("mouseover", overed)
        .on("mouseout", outed)
        .call(text => text.append("title").text(d => [
            `Airport: ${d.data.name}`,
            `Region: ${d.parent.data.name}`,
            `Outgoing routes: ${d.outgoing.length}`,
            `Incoming routes: ${d.incoming.length}`
        ].join("\n")));

    function overed(event, d) {
        node
            .attr("fill", "#999")
            .attr("font-weight", null);

        link
            .attr("stroke", colornone)
            .attr("stroke-opacity", 0.08);

        d3.select(this)
            .attr("fill", "#000")
            .attr("font-weight", "700");

        d3.selectAll(d.outgoing.map(l => l.path))
            .attr("stroke", ([, , airline]) => airlineColor[airline] || fallbackAirlineColor(airline))
            .attr("stroke-opacity", 1)
            .raise();

        d3.selectAll(d.incoming.map(l => l.path))
            .attr("stroke", ([, , airline]) => airlineColor[airline] || fallbackAirlineColor(airline))
            .attr("stroke-opacity", 1)
            .raise();

        d3.selectAll(d.outgoing.map(([, target]) => target.text))
            .attr("fill", "#000")
            .attr("font-weight", "700");

        d3.selectAll(d.incoming.map(([source]) => source.text))
            .attr("fill", "#000")
            .attr("font-weight", "700");
    }

    function outed() {
        node
            .attr("fill", "#222")
            .attr("font-weight", null);

        link
            .attr("stroke", ([, , airline]) => airlineColor[airline] || fallbackAirlineColor(airline))
            .attr("stroke-opacity", 0.55)
            .style("mix-blend-mode", "multiply");
    }

    return svg.node();
}