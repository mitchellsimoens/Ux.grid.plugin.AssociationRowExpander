Ext.define('Ux.grid.plugin.AssociationRowExpander', {
    extend : 'Ext.grid.plugin.RowExpander',
    alias  : 'plugin.associationrowexpander',

    /**
     * @cfg {Ext.XTemplate/String/String[]} rowBodyTpl The template to use to render data.
     *
     * **NOTE** This is only valid for belongsTo associations
     *
     * Defaults to '&nbsp;'
     */
    rowBodyTpl : '&nbsp;',

    /**
     * @cfg {String} loadingMessage A HTML snippet to show while data is loading.
     *
     * Defaults to '<div class="x-grid-rowbody-loading">Loading...</div>'
     */
    loadingMessage : '<div class="x-grid-rowbody-loading">Loading...</div>',

    /**
     * @cfg {String} type The type of association. Possible values are 'hasMany', 'belongsTo', and 'hasOne'
     *
     * **NOTE** Only 'hasMany' and 'belongsTo' supported currently.
     *
     * Defaults to 'hasMany'
     */
    type : 'hasMany',

    /**
     * @cfg {String} getterName The name of the hasMany association getterName to call to retrieve the
     * {@link Ext.data.Store} for the associated records.
     *
     * Defaults to null
     */
    getterName : null,

    /**
     * @cfg {Object} gridConfig The configuration Object to create the inner {@link Ext.grid.Panel}
     *
     * Defaults to null
     */
    gridConfig : null,

    /**
     * @cfg {Object} viewConfig The configuration Object to create the inner {@link Ext.view.View}
     *
     * Defaults to null
     */
    viewConfig : null,

    /**
     * @cfg {String} bubbleEventPrefix The prefix for the events that will be bubbled.
     *
     * Defaults to 'inner'
     */
    bubbleEventPrefix : 'inner',

    /**
     * @cfg {Array} bubbleEvents An array of {@link Ext.grid.Panel} events to bubble to the outer grid.
     *
     * Defaults to [ 'itemclick', 'itemdblclick' ]
     */
    bubbleEvents : [
        'itemclick',
        'itemdblclick'
    ],

    constructor : function(config) {
        var me  = this,
            tpl = config.rowBodyTpl || me.rowBodyTpl;

        me.callParent(arguments);

        me.cmps = new Ext.util.MixedCollection(null, function(o) {
            return o.recordId;
        });

        if ((typeof tpl == 'string' || Ext.isArray(tpl)) && me.type !== 'hasMany') {
            me.rowBodyTpl = new Ext.XTemplate(tpl);
        }
    },

    init : function(grid) {
        var me    = this,
            view  = grid.getView(),
            oldFn = view.processUIEvent;

        view.processUIEvent = function(e) {
            var view = this,
                item = e.getTarget(view.dataRowSelector || view.itemSelector, view.getTargetEl()),
                eGrid;

            eGrid = Ext.fly(item).up('.x-grid'); //grid el of UI event

            if (eGrid.id !== grid.el.id) {
                e.stopEvent();

                return;
            }

            return oldFn.apply(view, arguments);
        };

        me.callParent(arguments);
    },

    toggleRow : function(rowIdx) {
        var me        = this,
            rowNode   = me.view.getNode(rowIdx),
            row       = Ext.get(rowNode),
            nextBd    = Ext.get(row).down(this.rowBodyTrSelector),
            expandDiv = nextBd.down('div.x-grid-rowbody'),
            record    = me.view.getRecord(rowNode),
            grid      = me.getCmp();

        if (row.hasCls(me.rowCollapsedCls)) {
            row.removeCls(me.rowCollapsedCls);
            nextBd.removeCls(me.rowBodyHiddenCls);
            me.recordsExpanded[record.internalId] = true;

            me.showCmp(expandDiv, record);

            me.view.fireEvent('expandbody', rowNode, record, nextBd.dom);
        } else {
            row.addCls(me.rowCollapsedCls);
            nextBd.addCls(me.rowBodyHiddenCls);
            me.recordsExpanded[record.internalId] = false;

            me.collapseCmp(expandDiv, record);

            me.view.fireEvent('collapsebody', rowNode, record, nextBd.dom);
        }
    },

    createCmp : function(record, id, config) {
        var me         = this,
            type       = me.type,
            tpl        = me.rowBodyTpl,
            getterName = me.getterName,
            dataFn     = record[getterName],
            html;

        if (type === 'hasMany') {
            var gridConfig = config.gridConfig,
                viewConfig = config.viewConfig,
                comp       = gridConfig ? Ext.grid.Panel : Ext.view.View;

            config = gridConfig ? gridConfig : viewConfig;

            Ext.apply(config, {
                recordId : id,
                margin   : 10,
                store    : dataFn.call(record)
            });

            return new comp(config);
        } else if (type === 'belongsTo' || type === 'hasOne') {
            dataFn.call(record, {
                success : function(rec) {
                    if (!(rec instanceof Ext.data.Model)) {
                        rec = rec[0];
                    }
                    html = tpl.apply(rec.data);
                    config.row.update(html);
                    config.cmps.add({
                        recordId : id,
                        record   : record,
                        rec      : rec,
                        html     : html
                    });
                }
            });
        }
    },

    showCmp : function(row, record) {
        var me         = this,
            type       = me.type,
            cmps       = me.cmps,
            id         = record.getObservableId(),
            idx        = cmps.findIndex('recordId', id),
            cmp        = cmps.getAt(idx),
            gridConfig = me.gridConfig,
            viewConfig = me.viewConfig;

        if (!cmp) {
            row.update(me.loadingMessage);

            if (type === 'hasMany') {
                cmp = cmps.add(me.createCmp(record, id, {
                    gridConfig : gridConfig,
                    viewConfig : viewConfig
                }));
            } else if (type === 'belongsTo' || type === 'hasOne') {
                me.createCmp(record, id, {
                    row  : row,
                    cmps : cmps
                });
            }
        } else {
            if (type === 'belongsTo' || type === 'hasOne') {
                row.update(cmp.html);
            }
        }

        if (type === 'hasMany') {
            row.update('');

            cmp.render(row);

            me.bindEvents(cmp);
        }
    },

    getInnerCmp : function(record) {
        return this.cmps.getByKey(
            record.getObservableId()
        );
    },

    collapseCmp : function(row, record) {
        var me   = this,
            type = me.type,
            cmps = me.cmps,
            id   = record.getObservableId(),
            idx  = cmps.findIndex('recordId', id),
            cmp  = cmps.getAt(idx);

        if (type === 'hasMany' && cmp) {
            me.unbindEvents(cmp);
            cmps.remove(cmp);
            cmp.destroy();
        } else if (type === 'belongsTo') {
            row.update('');
        }
    },

    bindEvents : function(cmp) {
        var me           = this,
            bubblePrefix = me.bubbleEventPrefix,
            bubbleEvents = me.bubbleEvents,
            e            = 0,
            eNum         = bubbleEvents.length,
            events       = {},
            event;

        function makeEventHandler(event) {
            return Ext.Function.bind(me.bubbleInnerEvent, me, [bubblePrefix, event], 0);
        }

        for (; e < eNum; e++) {
            event         = bubbleEvents[e];
            events[event] = makeEventHandler(event);
        }

        cmp.on(events);
    },

    unbindEvents : function(cmp) {
        var me = this;

        cmp.clearListeners();
    },

    bubbleInnerEvent : function(prefix, event) {
        var outer = this.getCmp();

        arguments[0] = prefix + event;
        arguments[1] = outer;

        outer.fireEvent.apply(outer, arguments);
    }
});
