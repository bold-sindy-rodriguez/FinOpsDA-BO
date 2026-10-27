import { collection, onSnapshot } from "https://www.gstatic.com/firebasejs/12.13.0/firebase-firestore.js";

const currencyFormatter = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    currencyDisplay: "code",
    maximumFractionDigits: 0
});

const compactCurrencyFormatter = new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency: "COP",
    currencyDisplay: "narrowSymbol",
    notation: "compact",
    maximumFractionDigits: 1
});

const monthFormatter = new Intl.DateTimeFormat("es-CO", {
    month: "long",
    year: "numeric",
    timeZone: "UTC"
});

const chartColors = ["#121E6C", "#EE424E", "#5C8D6D", "#8A5CC2", "#D18B25", "#4B91B8"];
const knownTypes = ["Costo", "Gasto", "Sin clasificar"];
const svgNamespace = "http://www.w3.org/2000/svg";

export function escucharFacturacion(db, elements) {
    let records = [];
    let availableMonths = [];
    let initializedPeriod = false;

    const render = () => {
        if (availableMonths.length === 0) {
            elements.startRange.min = "0";
            elements.startRange.max = "0";
            elements.endRange.min = "0";
            elements.endRange.max = "0";
            elements.startRange.value = "0";
            elements.endRange.value = "0";
            elements.startLabel.textContent = "Sin periodos";
            elements.endLabel.textContent = "Sin periodos";
            elements.tableBody.replaceChildren();
            elements.total.textContent = currencyFormatter.format(0);
            elements.costTotal.textContent = currencyFormatter.format(0);
            elements.expenseTotal.textContent = currencyFormatter.format(0);
            elements.currentTotal.textContent = currencyFormatter.format(0);
            elements.currentMonth.textContent = `Sin registros para ${monthFormatter.format(currentMonthDate())}`;
            renderLineChart(elements.typeChart, [], [], "No hay datos para graficar.");
            renderLineChart(elements.channelChart, [], [], "No hay datos para graficar.");
            elements.status.textContent = "No se encontraron registros de facturación con una fecha válida.";
            return;
        }

        if (!initializedPeriod) {
            elements.startRange.value = "0";
            elements.endRange.value = String(availableMonths.length - 1);
            initializedPeriod = true;
        }

        const lastIndex = availableMonths.length - 1;
        elements.startRange.min = "0";
        elements.startRange.max = String(lastIndex);
        elements.endRange.min = "0";
        elements.endRange.max = String(lastIndex);

        let startIndex = clampIndex(elements.startRange.value, lastIndex);
        let endIndex = clampIndex(elements.endRange.value, lastIndex);
        if (startIndex > endIndex) {
            if (document.activeElement === elements.startRange) {
                endIndex = startIndex;
                elements.endRange.value = String(endIndex);
            } else {
                startIndex = endIndex;
                elements.startRange.value = String(startIndex);
            }
        }

        elements.startRange.value = String(startIndex);
        elements.endRange.value = String(endIndex);
        elements.startLabel.textContent = availableMonths[startIndex].label;
        elements.endLabel.textContent = availableMonths[endIndex].label;

        const visibleMonths = availableMonths.slice(startIndex, endIndex + 1);
        const visibleMonthKeys = new Set(visibleMonths.map((month) => month.key));
        const selectedType = elements.typeFilter.value;
        const buckets = new Map(visibleMonths.map((month) => [
            month.key,
            { month, byType: new Map(), byChannel: new Map() }
        ]));
        const rowsByKey = new Map();
        const currentMonthKey = getMonthKey(currentMonthDate());
        const currentTotals = new Map();
        let currentRecordCount = 0;

        records.forEach((record) => {
            const month = getMonth(record.Fecha);
            const amount = numericValue(record.Valor);
            if (!month || amount === null) {
                return;
            }

            const type = getType(record.Tipo_Registro);
            const channel = textValue(record.Canal) || "Sin canal";
            if (month.key === currentMonthKey) {
                currentRecordCount++;
                currentTotals.set(type, (currentTotals.get(type) || 0) + amount);
            }
            if (!visibleMonthKeys.has(month.key)) {
                return;
            }

            const bucket = buckets.get(month.key);
            bucket.byType.set(type, (bucket.byType.get(type) || 0) + amount);
            const channelTypeKey = `${channel}\u0000${type}`;
            const channelTypeAmount = bucket.byChannel.get(channelTypeKey) || {
                channel,
                type,
                amount: 0
            };
            channelTypeAmount.amount += amount;
            bucket.byChannel.set(channelTypeKey, channelTypeAmount);

            if (selectedType && selectedType !== type) {
                return;
            }
            const key = `${month.key}\u0000${channel}\u0000${type}`;
            const current = rowsByKey.get(key) || { month, channel, type, amount: 0 };
            current.amount += amount;
            rowsByKey.set(key, current);
        });

        const rows = [...rowsByKey.values()].sort((left, right) =>
            right.month.key.localeCompare(left.month.key) ||
            left.channel.localeCompare(right.channel, "es") ||
            left.type.localeCompare(right.type, "es")
        );
        renderTable(elements.tableBody, rows);

        const tableTotal = rows.reduce((sum, row) => sum + row.amount, 0);
        elements.total.textContent = currencyFormatter.format(tableTotal);

        const costTotal = currentTotals.get("Costo") || 0;
        const expenseTotal = currentTotals.get("Gasto") || 0;
        const currentTotal = [...currentTotals.values()].reduce((sum, amount) => sum + amount, 0);
        elements.costTotal.textContent = currencyFormatter.format(costTotal);
        elements.expenseTotal.textContent = currencyFormatter.format(expenseTotal);
        elements.currentTotal.textContent = currencyFormatter.format(currentTotal);
        elements.currentMonth.textContent = currentRecordCount === 0
            ? `Sin registros de facturación para ${monthFormatter.format(currentMonthDate())}. El NTR requiere ingresos y cantidad de transacciones.`
            : `Resumen de ${monthFormatter.format(currentMonthDate())}. El NTR requiere ingresos y cantidad de transacciones.`;

        const typesToShow = selectedType ? [selectedType] : knownTypes;
        renderLineChart(
            elements.typeChart,
            visibleMonths,
            typesToShow.map((type, index) => ({
                name: type,
                color: chartColors[index],
                values: visibleMonths.map((month) => buckets.get(month.key).byType.get(type) || 0)
            })),
            "No hay valores para mostrar por tipo en este periodo."
        );

        const channelTotals = new Map();
        visibleMonths.forEach((month) => {
            buckets.get(month.key).byChannel.forEach(({ channel, type, amount }) => {
                if (!selectedType || selectedType === type) {
                    channelTotals.set(channel, (channelTotals.get(channel) || 0) + amount);
                }
            });
        });
        const rankedChannels = [...channelTotals.entries()]
            .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "es"));
        const topChannels = rankedChannels.slice(0, 5);
        const otherChannels = new Set(rankedChannels.slice(5).map(([channel]) => channel));
        const channelSeries = topChannels.map(([channel], index) => ({
            name: channel,
            color: chartColors[index],
            values: visibleMonths.map((month) => {
                let total = 0;
                buckets.get(month.key).byChannel.forEach((entry) => {
                    if (entry.channel === channel && (!selectedType || entry.type === selectedType)) {
                        total += entry.amount;
                    }
                });
                return total;
            })
        }));

        if (otherChannels.size > 0) {
            channelSeries.push({
                name: "Otros canales",
                color: chartColors[5],
                values: visibleMonths.map((month) => {
                    let total = 0;
                    buckets.get(month.key).byChannel.forEach((entry) => {
                        if (otherChannels.has(entry.channel) && (!selectedType || entry.type === selectedType)) {
                            total += entry.amount;
                        }
                    });
                    return total;
                })
            });
        }
        renderLineChart(
            elements.channelChart,
            visibleMonths,
            channelSeries,
            "No hay valores para mostrar por canal en este periodo."
        );

        elements.status.textContent =
            `${records.length} registros cargados; ${rows.length} grupos en ${visibleMonths.length} meses.`;
    };

    [elements.startRange, elements.endRange].forEach((range) => {
        range.addEventListener("input", render);
        range.addEventListener("change", render);
    });
    elements.typeFilter.addEventListener("change", render);

    return onSnapshot(collection(db, "facturacion_consolidada"), (snapshot) => {
        const previousLastIndex = availableMonths.length - 1;
        const wasShowingLatestMonth = initializedPeriod &&
            Number(elements.endRange.value) === previousLastIndex;
        records = snapshot.docs.map((document) => document.data());
        availableMonths = getAvailableMonths(records);
        if (wasShowingLatestMonth && availableMonths.length > 0) {
            elements.endRange.value = String(availableMonths.length - 1);
        }
        render();
    }, (error) => {
        console.error("Error al cargar la facturación consolidada:", error);
        elements.status.textContent = error.code === "permission-denied"
            ? "Acceso denegado por las reglas de Firestore. Verifica que la cuenta tenga dominio @bold.co y que las reglas estén publicadas."
            : "No se pudieron cargar los registros. Revisa la conexión y vuelve a intentarlo.";
        elements.total.textContent = "No disponible";
        elements.costTotal.textContent = "No disponible";
        elements.expenseTotal.textContent = "No disponible";
        elements.currentTotal.textContent = "No disponible";
        elements.tableBody.replaceChildren();
        renderLineChart(elements.typeChart, [], [], "No se pudieron cargar los datos.");
        renderLineChart(elements.channelChart, [], [], "No se pudieron cargar los datos.");
    });
}

function renderTable(tableBody, rows) {
    tableBody.replaceChildren();
    if (rows.length === 0) {
        const row = document.createElement("tr");
        const cell = document.createElement("td");
        cell.colSpan = 4;
        cell.textContent = "No hay registros para los filtros seleccionados.";
        row.append(cell);
        tableBody.append(row);
        return;
    }

    rows.forEach(({ month, channel, type, amount }) => {
        const row = document.createElement("tr");
        [month.label, channel, currencyFormatter.format(amount), type].forEach((value) => {
            const cell = document.createElement("td");
            cell.textContent = value;
            row.append(cell);
        });
        tableBody.append(row);
    });
}

function renderLineChart(container, months, datasets, emptyMessage) {
    container.replaceChildren();
    if (months.length === 0 || datasets.length === 0) {
        const message = document.createElement("p");
        message.className = "mensaje-grafico";
        message.textContent = emptyMessage;
        container.append(message);
        return;
    }

    const width = Math.max(720, months.length * 92);
    const height = 340;
    const margin = { top: 20, right: 24, bottom: 76, left: 100 };
    const chartWidth = width - margin.left - margin.right;
    const chartHeight = height - margin.top - margin.bottom;
    const maxValue = Math.max(0, ...datasets.flatMap((dataset) => dataset.values));
    const yMax = maxValue > 0 ? maxValue * 1.12 : 1;
    const xAt = (index) => margin.left + (months.length === 1
        ? chartWidth / 2
        : (index / (months.length - 1)) * chartWidth);
    const yAt = (value) => margin.top + chartHeight - (value / yMax) * chartHeight;
    const svg = createSvgElement("svg", {
        viewBox: `0 0 ${width} ${height}`,
        role: "img",
        "aria-label": `Gráfico lineal con ${datasets.map((dataset) => dataset.name).join(", ")}`
    });

    for (let tick = 0; tick <= 4; tick++) {
        const value = (yMax / 4) * tick;
        const y = yAt(value);
        svg.append(createSvgElement("line", {
            x1: margin.left,
            y1: y,
            x2: width - margin.right,
            y2: y,
            class: "grafico-cuadricula"
        }));
        const tickLabel = createSvgElement("text", {
            x: margin.left - 12,
            y: y + 4,
            class: "grafico-eje grafico-eje-valor",
            "text-anchor": "end"
        });
        tickLabel.textContent = compactCurrencyFormatter.format(value);
        svg.append(tickLabel);
    }

    months.forEach((month, index) => {
        const label = createSvgElement("text", {
            x: xAt(index),
            y: height - margin.bottom + 20,
            class: "grafico-eje grafico-eje-mes",
            transform: `rotate(-35 ${xAt(index)} ${height - margin.bottom + 20})`,
            "text-anchor": "end"
        });
        label.textContent = shortMonthLabel(month.key);
        svg.append(label);
    });

    const legend = document.createElement("ul");
    legend.className = "leyenda-grafico";
    datasets.forEach((dataset) => {
        const path = dataset.values.map((value, index) =>
            `${index === 0 ? "M" : "L"} ${xAt(index)} ${yAt(value)}`
        ).join(" ");
        svg.append(createSvgElement("path", { d: path, class: "grafico-linea", stroke: dataset.color }));

        dataset.values.forEach((value, index) => {
            const circle = createSvgElement("circle", {
                cx: xAt(index),
                cy: yAt(value),
                r: 5,
                class: "grafico-punto",
                fill: dataset.color
            });
            const pointTitle = createSvgElement("title");
            pointTitle.textContent = `${months[index].label} · ${dataset.name}: ${currencyFormatter.format(value)}`;
            circle.append(pointTitle);
            svg.append(circle);
        });

        const item = document.createElement("li");
        const swatch = document.createElement("span");
        swatch.className = "muestra-leyenda";
        swatch.style.backgroundColor = dataset.color;
        const label = document.createElement("span");
        label.textContent = dataset.name;
        item.append(swatch, label);
        legend.append(item);
    });

    container.append(svg, legend);
}

function createSvgElement(tag, attributes = {}) {
    const element = document.createElementNS(svgNamespace, tag);
    Object.entries(attributes).forEach(([name, value]) => element.setAttribute(name, String(value)));
    return element;
}

function getAvailableMonths(records) {
    const observedMonths = new Map();
    records.forEach((record) => {
        const month = getMonth(record.Fecha);
        if (month) {
            observedMonths.set(month.key, month);
        }
    });
    const observed = [...observedMonths.values()].sort((left, right) => left.key.localeCompare(right.key));
    if (observed.length === 0) {
        return [];
    }

    const [startYear, startMonth] = observed[0].key.split("-").map(Number);
    const [endYear, endMonth] = observed[observed.length - 1].key.split("-").map(Number);
    const months = [];
    let year = startYear;
    let month = startMonth;
    while (year < endYear || (year === endYear && month <= endMonth)) {
        const date = new Date(Date.UTC(year, month - 1, 1));
        months.push({ key: getMonthKey(date), label: monthFormatter.format(date) });
        month++;
        if (month > 12) {
            month = 1;
            year++;
        }
    }
    return months;
}

function getMonth(value) {
    const text = textValue(value);
    const match = text.match(/^(\d{4})-(\d{2})/);
    let date;

    if (match) {
        const year = Number(match[1]);
        const monthIndex = Number(match[2]) - 1;
        if (monthIndex < 0 || monthIndex > 11) {
            return null;
        }
        date = new Date(Date.UTC(year, monthIndex, 1));
    } else {
        date = new Date(text);
        if (Number.isNaN(date.getTime())) {
            return null;
        }
        date = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
    }

    if (Number.isNaN(date.getTime())) {
        return null;
    }
    const key = getMonthKey(date);
    return { key, label: monthFormatter.format(date) };
}

function getMonthKey(date) {
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

function currentMonthDate() {
    const now = new Date();
    return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
}

function clampIndex(value, lastIndex) {
    const index = Number.parseInt(value, 10);
    return Number.isInteger(index) ? Math.min(Math.max(index, 0), lastIndex) : 0;
}

function shortMonthLabel(monthKey) {
    const [year, month] = monthKey.split("-").map(Number);
    return new Intl.DateTimeFormat("es-CO", {
        month: "short",
        timeZone: "UTC"
    }).format(new Date(Date.UTC(year, month - 1, 1))) + ` ${year}`;
}

function getType(value) {
    const type = textValue(value).trim().toLocaleLowerCase("es");
    if (type.includes("costo")) {
        return "Costo";
    }
    if (type.includes("gasto")) {
        return "Gasto";
    }
    return "Sin clasificar";
}

function numericValue(value) {
    if (typeof value === "number") {
        return Number.isFinite(value) ? value : null;
    }
    if (typeof value !== "string" || !value.trim()) {
        return null;
    }

    let normalized = value.trim().replace(/[^\d,.-]/g, "");
    if (!normalized || !/[0-9]/.test(normalized) || !/^-?[\d.,]+$/.test(normalized)) {
        return null;
    }
    const comma = normalized.lastIndexOf(",");
    const dot = normalized.lastIndexOf(".");
    if (comma >= 0 && dot >= 0) {
        const decimalSeparator = comma > dot ? "," : ".";
        const thousandsSeparator = decimalSeparator === "," ? "." : ",";
        normalized = normalized.split(thousandsSeparator).join("");
        if (decimalSeparator === ",") {
            normalized = normalized.replace(",", ".");
        }
    } else if (comma >= 0) {
        normalized = normalized.replace(",", ".");
    }

    if (!/^-?(?:\d+\.?\d*|\.\d+)$/.test(normalized)) {
        return null;
    }
    const number = Number(normalized);
    return Number.isFinite(number) ? number : null;
}

function textValue(value) {
    return value === null || value === undefined ? "" : String(value).trim();
}
