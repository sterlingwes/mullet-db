var _ = require('underscore')
  , EJSON = require('meteor-ejson')
  , nodeCrypto = require('crypto')
  , RSVP = require('rsvp');

module.exports = function(db__DRIVER, config) {
    
    var DB = db__DRIVER
      , schemas = {};
    
    /*
     * Schema
     * 
     * 
     */
    function Schema(spec, useDb) {
        this.checkSpec(spec);
        this.DB = useDb;
        this.DB.wrapDriver(this); // link back so drivers can see spec
    }
    
    Schema.prototype.checkSpec = function(spec) {
        this.spec = spec;
        this.syns = _.filter(_.map(spec.fields, function(field, fname) {
            
            return {
                field:  fname,
                syns:   field.synonyms
            };
            
        }), function(f) {
            return f.syns && f.syns.length;
        });
        this.whitelist = _.without(_.map(spec.fields, function(field, fname) {
            return field.safe ? fname : false;
        }), false);
    };
    
    Schema.prototype.getId = function() {
        var bytes,
            digits = 24,
            numBytes = Math.ceil(digits / 2);
        
        try {
          bytes = nodeCrypto.randomBytes(numBytes);
        } catch (e) {
          // XXX should re-throw any error except insufficient entropy
          bytes = nodeCrypto.pseudoRandomBytes(numBytes);
        }
        var result = bytes.toString("hex");
        // If the number of digits is odd, we'll have generated an extra 4 bits
        // of randomness, so we need to trim the last digit.
        return result.substring(0, digits);
    };
    
    Schema.prototype.force = function(o) {

        var d;
        
        // map synonyms to main field keys
        
        if(this.syns.length)
            _.each(this.syns, function(s) {
                _.each(s, function(ss) {
                    if(o[ss])   o[s.field] = o[ss];
                });
            }.bind(this));
        
        // whitelist field keys
                
        d = _.pick(o, Object.keys(this.spec.fields));

        // apply any transformations, in order
        
        _.each(this.spec.fields, function(spec, name) {
            if(spec && spec.transform)
                _.each(_.isArray(spec.transform) ? spec.transform : [spec.transform], function(trans) {
                    if(spec.type === String && trans in String.prototype)
                        d[name] = d[name][trans]();
                });
        });

        return d;
    };
    
    Schema.prototype.serialize = function(options) {
        var fields = _.extend({ _id: this.id }, this.toSafe());
        return EJSON.stringify(fields, options);
    };
    
    Schema.prototype.get = function(key) {
        if(key)
            return this.fields[key];
        
        return _.extend({ _id: this.id }, this.fields);
    };
    
    Schema.prototype.toSafe = function() {
        return _.pick(this.fields, this.whitelist);
    };
    
    Schema.prototype.setPush = function(key, val) {
        
        if(!this.fields[key])
            this.fields[key] = [];
        
        this.fields[key].push(val); // should probably force()
        
        return this; // chain gang
    };
    
    Schema.prototype.set = function(key, val) {
        
        if(key && !val) {
            val = key;
            if(typeof val === 'string') {
                try {
                    val = EJSON.parse(val);
                } catch(e) {
                    val = {};
                    console.warn('! Failed to deserialize on database read: '+ val);
                }
            }
            _.extend(this.fields, this.force(val || {}));
        }
        else {
            var path = key.split('.'),
                curs = this.fields;
            _.each(path, function(part, i) {
                if(i==path.length-1)
                    curs[part] = val; // need to 'force' this value, per above logic & schema spec
                else {
                    if(!curs[part]) curs[part] = {};
                    curs = curs[part];
                }
            });
        }
        
        return this; // chain gang
    };
    
    Schema.prototype.save = function(cb) {
        // insert object, return promise that evals to new object
        return new RSVP.Promise(function(resolve, reject) {
            var existing = this.id;
            this.DB.insert(this.name)(this, function(err, res) {
                
                if(_.isArray(res))  res = res[0];
                
                if(err) return reject(err);
                else {
                    if(!existing && !this.id && res._id) {
                        this.id = res._id;
                    }
                    resolve(this);
                }
                if(typeof cb === 'function')    cb(err, existing ? res : this);
                
            }.bind(this));
        }.bind(this));
    };
    
    /*
     * createSchema - factory for collection objects
     * 
     * - name, name of collection
     * - spec, object literal with fields key defining collection item structure
     * 
     * returns a NewSchema prototype
     */
    function createSchema(name, spec) {

        var useDb = DB.open(spec.db || config.dbName);
        
        /*
         * NewSchema - prototype for our new collection
         * 
         * - val, object with fields / values for new item in collection
         * 
         * TODO: get rid of existing flag, rely on existence of _id / id as in Schema.save()
         */
        var NewSchema = function(val) {
            this.fields = {};
            this.set(val);
            
            // if our interface handles the _id itself, do else
            
            if(!useDb.hasId && !val._id)
                this.id = this.getId();
            else {
                this.id = this.fields._id || val._id;
                if(this.id) this.existing = true;
            }
        };
        
        NewSchema.prototype = new Schema(spec, useDb);
        NewSchema.prototype.spec = spec;
        NewSchema.prototype.name = name;
        
        // define static methods
        
        ['insert', 'update', 'find', 'remove'].forEach(function(method) {
            NewSchema[method] = typeof useDb[method] === 'function' ? useDb[method](name) : function() {
                return console.error('! No %s method defined for this DB driver.', method);
            };
        });
        
        return NewSchema;
        
    }
    
    /*
     * external API of DB app
     */
    var DBapi = _.extend({
        
        schema: function(name, spec) {
            if(!spec || typeof spec !== 'object')
                return schemas[name];
            
            schemas[name] = createSchema(name, _.clone(spec));
            return schemas[name];
        }
        
    }, DB);
    
    return DBapi;
    
};