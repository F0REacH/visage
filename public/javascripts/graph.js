var collectdSingleGraph = new Class({
    Implements: [Options, Events],
        options: {
            width: 900,
            height: 220,
            leftEdge: 100,
            topEdge: 10,
            gridWidth: 670,
            gridHeight: 200,
            columns: 60,
            rows: 8,
            topGutter: 50,
            gridBorderColour: '#ccc',
            secureJSON: false
    },
    initialize: function(element, host, plugin, options) {
        this.element = element;
        this.setOptions(options);
				this.options.host = host;
				this.options.plugin = plugin;
        this.canvas = Raphael(element, this.options.width, this.options.height);
        this.getData(); // calls graphData
    },
    getData: function() {
        this.request = new Request.JSON({
            url: ['/data', this.options.host, this.options.plugin, this.options.plugin_instance].join('/'),
            secure: this.options.secureJSON,
            onComplete: function(json) {
                this.graphData(json);
            }.bind(this),
            onFailure: function(header, value) {
                $(this.element).set('html', header)
            }.bind(this)
        });

        this.request.get();
    },
    graphData: function(data) {
        this.stats = data[this.options.host][this.options.plugin][this.options.plugin_instance];
        this.startTime = this.stats.splice(0,1);
        this.endTime = this.stats.splice(0,1);
        this.labels = this.stats.splice(0,1)[0];
        this.dataSet = this.stats.splice(0,1);

        this.structuredDataSet = new Hash()
        this.labels.each(function(label, index) {
            blob = new Hash()
            blob.set('data', this.dataSet[0].map(function(item) {
                return isNaN(item[index]) ? 0 : item[index]
            }));
            blob.set('min', Math.min.apply(Math, blob.get('data')));                              
            blob.set('max', Math.max.apply(Math, blob.get('data')));                              
            blob.set('colour', this.options.colours[this.options.plugin][this.options.plugin_instance][label]);
            this.structuredDataSet.set(label, blob);
        }, this);
           
        length = this.structuredDataSet.get(this.labels[0]).get('data').length
  
        var x = [];
        for (var i = 0; i < length; i++) {
            x[i] = i * this.options.gridWidth / length;
        }
  
        y = []
        colours = []
        this.structuredDataSet.each(function(value, key) { 
            y.include(value.get('data'));  
            colours.include(value.get('colour'));
        });
  
        this.canvas.g.txtattr.font = "11px 'sans-serif'";
        this.canvas.g.linechart(this.options.leftEdge, this.options.topEdge, this.options.gridWidth, this.options.gridHeight, x, y, {
            nostroke: false, shade: false, width: 1.5,
            axis: "0 0 1 1", axisxlabels: 'head', axisxstep: 10,
            colors: colours
        });
  
        this.buildLabels(this.labels)
    },
    
		buildLabels: function(labels) {
        labels.each(function(label) {
            container = new Element('div', {
                'class': 'label plugin',
            });

            box = new Element('span', {
                'class': 'label plugin box ' + label,
                'html': '&nbsp;',
                'styles': { 
                      'background-color': this.options.colours[this.options.plugin][this.options.plugin_instance][label]
                }
            });
        
            desc = new Element('span', {
                'class': 'label plugin description ' + label,
                'html': label
            });
        
            container.grab(box);
            container.grab(desc);
            $(this.element).getChildren('div.labels')[0].grab(container);

        },this);    
    }

});

var collectdMultiGraph = new Class({
		Extends: collectdSingleGraph,
    graphData: function(data) {

				this.plugin_instances = new Hash()

        $each(data[this.options.host][this.options.plugin], function(data, plugin_instance) {

            stats = data;
            startTime = stats.splice(0,1);
            endTime = stats.splice(0,1);
            labels = stats.splice(0,1)[0];
            dataSet = stats.splice(0,1);

		        structuredDataSet = new Hash()
		        labels.each(function(label, index) {
		            blob = new Hash()
		            blob.set('data', dataSet[0].map(function(item) {
		                return isNaN(item[index]) ? 0 : item[index]
		            }));
		            blob.set('min', Math.min.apply(Math, blob.get('data')));                              
		            blob.set('max', Math.max.apply(Math, blob.get('data')));
		            blob.set('colour', this.options.colours[this.options.plugin][plugin_instance][label]);
		            structuredDataSet.set(label, blob);
		        }, this);

						this.plugin_instances.set(plugin_instance, structuredDataSet);
						this.length = structuredDataSet.value.get('data').length
		           
				}, this);

				var x = [];
        for (var i = 0; i < this.length; i++) {
            x[i] = i * this.options.gridWidth / this.length;
        }

        y = []
        colours = []
				this.plugin_instances.each(function(data, name) {
        		y.include(data.value.get('data'));
						colours.include(data.value.get('colour'));
				})
        
				this.canvas.g.txtattr.font = "11px 'sans-serif'";
        this.canvas.g.linechart(this.options.leftEdge, this.options.topEdge, this.options.gridWidth, this.options.gridHeight, x, y, {
            nostroke: false, shade: false, width: 1.5,
            axis: "0 0 1 1", axisxlabels: 'head', axisxstep: 10,
            colors: colours
        });
  
        this.buildLabels(this.plugin_instances)
		},
		buildLabels: function(plugin_instances) {
        plugin_instances.each(function(data, name) {
            container = new Element('div', {
                'class': 'label plugin',
            });

            box = new Element('span', {
                'class': 'label plugin box ' + name,
                'html': '&nbsp;',
                'styles': { 
                      'background-color': data.value.get('colour')
                }
            });
        
            desc = new Element('span', {
                'class': 'label plugin description ' + name,
                'html': name.split('-')[1]
            });
        
            container.grab(box);
            container.grab(desc);
            $(this.element).getChildren('div.labels')[0].grab(container);

        },this);    
    }

});