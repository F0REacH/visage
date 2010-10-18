function formatSeriesLabel(labels) {
    var host     = labels[0],
        plugin   = labels[1],
        instance = labels[2],
        metric   = labels[3],
        name;

    // Generic label building
    name = instance
    name = name.replace(plugin, '')
    name = name.replace(plugin.split('-')[0], '')
    name = name.replace('tcp_connections', '')
    name = name.replace('ps_state', '')
    name += metric == "value" ? "" : " (" + metric + ")"
    name = name.replace(/^[-|_]*/, '')
    name = name.trim().replace(/^\((.*)\)$/, '$1')
    name = plugin == "irq" ? name.replace(/^/, 'irq ') : ''

    // Plugin specific labeling
    if (plugin == "interface") {
        name += instance.replace(/^if_(.*)-(.*)/, '$2 $1') + ' (' + metric + ')'
    }
    if (["processes", "memory"].contains(plugin) || plugin.test(/^cpu-\d+/) ) {
        name += instance.split('-')[1]
    }
    if (plugin == "swap") {
        if (instance.test(/^swap_io/)) {
            name += instance.replace(/^swap_(\w*)-(.*)$/, '$1 $2')
        }
        if (instance.test(/^swap-/)) {
            name += instance.split('-')[1]
        }
    }
    if (plugin == "load") {
        name += metric.replace(/^\((.*)\)$/, '$1')
    }
    if (plugin.test(/^disk/)) {
        name += instance.replace(/^disk_/, '') + ' (' + metric + ')'
    }
    if (["entropy","users"].contains(plugin)) {
        name += metric
    }
    if (plugin == "uptime") {
        name += instance
    }
    if (plugin == "ping") {
        if (instance.test(/^ping_/)) {
            name += instance.replace(/^ping_(.*)-(.*)$/, '$1 $2')
        } else {
            name += metric + instance.split('-')[1]
        }
    }
    if (plugin == "vmem") {
        if (instance.test(/^vmpage_number-/)) {
            name += instance.replace(/^vmpage_number-(.*)$/, '$1').replace('_', ' ')
        }
        if (instance.test(/^vmpage_io/)) {
            name += instance.replace(/^vmpage_io-(.*)$/, '$1 ') + metric
        }
        if (instance.test(/^vmpage_faults/)) {
            name += metric.trim() == "minflt" ? 'minor' : 'major'
            name += ' faults'
        }
    }
    if (plugin.test(/^tcpconns/)) {
        name += instance.split('-')[1].replace('_', ' ')
    }
    if (plugin.test(/^tail/)) {
        name += plugin.split('-').slice(1).join('-') + ' '
        name += instance.split('-').slice(1).join('-')
    }
    if (plugin == "apache") {
        var stash = instance.split('_')[1]
        if (stash.test(/^scoreboard/)) {
          name += 'connections: ' + stash.split('-')[1]
        } else {
          name += stash
        }

    }
    return name.trim()
}

function formatValue(value, places) {
  var places = places ? places : 0
  switch(true) {
    case (Math.abs(value) > 1125899906842624):
      var label = value / 1125899906842624,
          unit  = 'P';
      break
    case (Math.abs(value) > 1099511627776):
      var label = value / 1099511627776,
          unit  = 'T';
      break
    case (Math.abs(value) > 1073741824):
      var label = value / 1073741824,
          unit  = 'G';
      break
    case (Math.abs(value) > 1048576):
      var label = value / 1048576,
          unit  = 'M';
      break
    case (Math.abs(value) > 1024):
      var label = value / 1024,
          unit  = 'K';
      break
    default:
      var label = value,
          unit  = '';
      break
  }

  var rounded = label.round(places)

  return rounded + unit
}

function formatDate(d) {
  var d = new Date(d * 1000)
  return d.format("%Y-%m-%d %H:%M:%S UTC%T")
}



/*
 * visageBase()
 *
 * Base class for fetching data and setting graph options.
 * Should be used by other classes to build specialised graphing behaviour.
 *
 */
var visageBase = new Class({
    Implements: [Options, Events],
    options: {
        secureJSON: false,
        httpMethod: 'get',
        live: false
    },
    initialize: function(element, host, plugin, options) {
        this.parentElement = element
        this.setOptions(options)
        this.options.host = host
        this.options.plugin = plugin
        data = new Hash()
        if($chk(this.options.start)) {
            data.set('start', this.options.start)
        }
        if($chk(this.options.finish)) {
            data.set('finish', this.options.finish)
        }
        this.requestData = data;
        this.getData(); // calls graphData
    },
    dataURL: function() {
        var url = ['data', this.options.host, this.options.plugin]
        // if the data exists on another host (useful for embedding)
        if ($defined(this.options.baseurl)) {
            url.unshift(this.options.baseurl.replace(/\/$/, ''))
        }
        // for specific plugin instances
        if ($chk(this.options.pluginInstance)) {
            url.push(this.options.pluginInstance)
        }
        // if no url is specified
        if (!url[0].match(/http\:\/\//)) {
            url[0] = '/' + url[0]
        }
        return url.join('/')
    },
    getData: function() {
        this.request = new Request.JSONP({
            url: this.dataURL(),
            data: this.requestData,
            secure: this.options.secureJSON,
            method: this.options.httpMethod,
            onComplete: function(json) {
                this.graphData(json);
            }.bind(this),
            onFailure: function(header, value) {
                $(this.parentElement).set('html', header)
            }.bind(this)
        });

        this.request.send();
    },
    graphName: function() {
        name = $chk(this.options.name) ? this.options.name : this.options.plugin
        return name
    },
});


/*
 * visageGraph()
 *
 * General purpose graph for rendering data from a single plugin
 * with multiple plugin instances.
 *
 * Builds upon visageBase().
 *
 */
var visageGraph = new Class({
    Extends: visageBase,
    Implements: Chain,
    // assemble data to graph, then draw it
    graphData: function(data) {
        this.response = data
        this.buildDataStructures()

        if ( $defined(this.chart) ) {
            this.series.each(function(series, index) {
                this.chart.series[index].setData(series.data)
            }, this);
        } else {
            this.drawChart()
        }
    },
    buildDataStructures: function (data) {
        var series  = this.series = []
        var host    = this.options.host
        var plugin  = this.options.plugin
        var data    = data ? data : this.response

        $each(data[host][plugin], function(instance, iname) {
            $each(instance, function(metric, mname) {
                var set = {
                    name:          [ host, plugin, iname, mname ],
                    data:          metric.data,
                    pointStart:    metric.start,
                    pointInterval: (metric.finish - metric.start) / metric.data.length
                };

                series.push(set)
            }, this);
        }, this);

        return series
    },
    drawChart: function() {
        var series  = this.series,
            title   = this.graphName(),
            element = this.parentElement,
            ytitle  = this.options.plugin

        this.chart = new Highcharts.Chart({
            chart: {
                renderTo: element,
                defaultSeriesType: 'line',
                marginRight: 200,
                marginBottom: 25,
                zoomType: 'xy',
                height: 300,
                events: {
                    load: function(e) {
                        setInterval(function() {
                            if (this.options.live) {
                                this.getData()
                            }
                        }.bind(this), 10000);
                    }.bind(this)
                }
            },
            title: {
              text: title,
              style: {
                fontSize: '20px',
                fontWeight: 'bold',
                color: "#333333"
              }
            },
            xAxis: {
              type: 'datetime',
              labels: {
                y: 20,
                formatter: function() {
                  var d = new Date(this.value * 1000)
                  return d.format("%H:%M")
                }
              },
                title: {
                    text: null
                }
            },
            yAxis: {
              title: {
                text: ytitle
              },
              maxPadding: 0,
              plotLines: [{
                width: 0.5,
              }],
              labels: {
                formatter: function() {
                  return formatValue(this.value)
               }
              }
            },
            plotOptions: {
              series: {
                marker: {
                  enabled: false,
                  stacking: 'normal',
                  states: {
                    hover: {
                      enabled: true
                    }
                  }
                }
              }
            },
            tooltip: {
              formatter: function() {
                var tip;
                tip = '<b>' + formatSeriesLabel(this.series.name).trim() + '</b>-> '
                tip += formatValue(this.y, 2) + ' <br/>'
                tip += formatDate(this.x)

                return tip
              }
            },
            legend: {
                layout: 'vertical',
                align: 'right',
                verticalAlign: 'top',
                x: -10,
                y: 60,
                borderWidth: 0,
                itemWidth: 186,
                labelFormatter: function() {
                    return formatSeriesLabel(this.name)
                },
                itemStyle: {
                    cursor: 'pointer',
                    color:  '#333333'
                },
                itemHoverStyle: {
                    color:  '#777777'
                }

            },
            series: series,
            credits: {
              enabled: false
            }
          });

          this.buildDateSelector();

        // Set a minimum extreme of 0 when the data isn't negative 0.
        /*
        var dataMins = []
        this.chart.yAxis.each(function(axis) {
            dataMins.push(axis.getExtremes().dataMin)
        });
        if ( Math.max(dataMins) == 0 ) {
          this.chart.yAxis.each(function(axis) {
              axis.setExtremes(0, axis.max)
          });
        }
        */
    },
    buildDateSelector: function() {
        /*
         * container
         *   \
         *    - form
         *        \
         *         - select
         *         |   \
         *         |    - option
         *         |    |
         *         |    - option
         *         |
         *         - submit
         */
        var currentDate = new Date;
        var currentUnixTime = parseInt(currentDate.getTime() / 1000);

        var container = $(this.parentElement);
        var form = new Element('form', {
            'method': 'get',
            'events': {
                'submit': function(e, foo) {
                    e.stop();
                    e.target.getElement('select').getSelected().each(function(option) {
                        data = new Hash()
                        split = option.value.split('=')
                        data.set(split[0], split[1])
                    });
                    this.requestData = data

                   /* Draw everything again. */
                    this.getData();
                }.bind(this)
            }
        });

        var select = new Element('select', { 'class': 'date timescale' });
        var timescales = new Hash({ 'hour': 1, '2 hours': 2, '6 hours': 6, '12 hours': 12,
                                    'day': 24, '2 days': 48, '3 days': 72,
                                    'week': 168, '2 weeks': 336, 'month': 672 });
        timescales.each(function(hour, label) {
            var current = this.currentTimePeriod == 'last {label}'.substitute({'label': label });
            var value = "start={start}".substitute({'start': currentUnixTime - (hour * 3600)});
            var html = 'last {label}'.substitute({'label': label });

            var option = new Element('option', {
                html: html,
                value: value,
                selected: (current ? 'selected' : '')

            });
            select.grab(option)
        });

        var submit = new Element('input', { 'type': 'submit', 'value': 'show' });

        var liveToggler = new Element('input', {
            'type': 'checkbox',
            'id':   this.parentElement + '-live',
            'name': 'live',
            'events': {
                'click': function() {
                    this.options.live = !this.options.live
                }.bind(this)
            },
            'styles': {
                'margin-left': '4px',
                'cursor': 'pointer'
            }
        });

        var liveLabel = new Element('label', {
            'for': this.parentElement + '-live',
            'html': 'Live',
            'styles': {
                'font-family': 'sans-serif',
                'font-size':   '11px',
                'margin-left': '4px',
                'cursor': 'pointer'
            }
        });

        form.grab(select)
        form.grab(submit)
        form.grab(liveToggler)
        form.grab(liveLabel)
        container.grab(form, 'top')
    },



});

//    buildEmbedder: function() {
//        var pre = new Element('textarea', {
//                'id': 'embedder',
//                'class': 'embedder',
//                'html': this.embedCode(),
//                'styles': {
//                    'width': '500px',
//                    'padding': '3px'
//                }
//        });
//        this.embedderContainer.grab(pre);
//
//        var slider = new Fx.Slide(pre, {
//            duration: 200
//        });
//
//        slider.hide();
//
//        var toggler = new Element('a', {
//                'id': 'toggler',
//                'class': 'toggler',
//                'html': '(embed)',
//                'href': '#',
//                'styles': {
//                    'font-size': '0.7em',
//                }
//        });
//        toggler.addEvent('click', function(e) {
//            e.stop();
//            slider.toggle();
//        });
//        this.embedderTogglerContainer.grab(toggler);
//    },
//    embedCode: function() {
//        baseurl = "{protocol}//{host}".substitute({'host': window.location.host, 'protocol': window.location.protocol});
//        code = "<script src='{baseurl}/javascripts/visage.js' type='text/javascript'></script>".substitute({'baseurl': baseurl});
//        code += "<div id='graph'></div>"
//        code += "<script type='text/javascript'>window.addEvent('domready', function() { var graph = new visageGraph('graph', '{host}', '{plugin}', ".substitute({'host': this.options.host, 'plugin': this.options.plugin});
//        code += "{"
//        code += "width: 900, height: 220, gridWidth: 800, gridHeight: 200, baseurl: '{baseurl}'".substitute({'baseurl': baseurl});
//        code += "}); });</script>"
//        return code.replace('<', '&lt;').replace('>', '&gt;')
//    },
